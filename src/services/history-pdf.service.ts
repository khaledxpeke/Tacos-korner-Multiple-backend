import type { Request } from "express";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/fr";
import "dayjs/locale/en";
import "dayjs/locale/ar";
import puppeteer, { type Browser } from "puppeteer";
import Handlebars from "handlebars";
import QRCode from "qrcode";
import { Settings } from "../models/settings.model";
import { Restaurant } from "../models/restaurant.model";
import { env } from "../config/environment";
import { paths } from "../config/paths";
import { i18next } from "../config/i18n";
import type { PdfOrderData, RestaurantWithLogo } from "../interfaces/history.interface";

dayjs.extend(utc);
dayjs.extend(timezone);

const receiptLanguages = ["fr", "en", "ar"] as const;

export interface ReceiptLine {
  name?: string;
  count?: number;
  price?: number | string;
}

export interface ReceiptPdfOrder {
  restaurantName: string;
  address: string;
  commandNumber?: number;
  packLabel: string;
  customerName: string;
  boughtAt: Date | string;
  methodLabel: string;
  language?: string;
  currency?: string;
  tva?: number;
  paid: number;
  discountValue?: number;
  couponType?: string | null;
  loyaltyDiscount?: number;
  qrCode?: string;
  products: Array<{
    plat: { name: string; count?: number; price?: number };
    variation?: { name?: string; price?: number | string } | null;
    addons?: ReceiptLine[];
    extras?: ReceiptLine[];
    total?: number | string;
  }>;
}

let browserPromise: Promise<Browser> | null = null;
let receiptTemplate: HandlebarsTemplateDelegate | null = null;

function sharedBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      .then((browser) => {
        browser.once("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((error: unknown) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

function money(value: number) {
  return value.toFixed(2);
}

function lineLabel(name: string, count: number, marker: "X" | "x") {
  const trimmed = name.trim();
  if (count > 1) return `${count} ${marker} ${trimmed}`;
  return trimmed;
}

export const generateReceiptPdf = async (order: ReceiptPdfOrder) => {
  const language = receiptLanguages.includes(order.language as (typeof receiptLanguages)[number])
    ? (order.language as (typeof receiptLanguages)[number])
    : "fr";
  const t = i18next.getFixedT(language);
  const tva = Number(order.tva) || 0;
  const paid = Number(order.paid) || 0;
  const ht = tva > 0 ? (100 * paid) / (100 + tva) : paid;
  const tvaAmount = paid - ht;
  const loyalty = Number(order.loyaltyDiscount) || 0;
  const discountValue = Number(order.discountValue) || 0;
  const subtotal = order.products.reduce((sum, product) => sum + (Number(product.total) || 0), 0);
  const discount =
    discountValue > 0
      ? order.couponType === "percentage"
        ? `-${discountValue} %`
        : `-${money(discountValue)}`
      : "";
  const qr = order.qrCode?.trim()
    ? await QRCode.toDataURL(order.qrCode.trim(), { margin: 1, width: 180 })
    : "";
  if (!receiptTemplate) {
    receiptTemplate = Handlebars.compile(
      fs.readFileSync(path.join(paths.template, "receipt.handlebars"), "utf8")
    );
  }
  const html = receiptTemplate({
    language,
    dir: language === "ar" ? "rtl" : "ltr",
    restaurantName: order.restaurantName,
    address: order.address || "",
    commandNumber: order.commandNumber ?? "",
    pack: order.packLabel,
    customerName: order.customerName,
    boughtAt: dayjs(order.boughtAt)
      .tz(env.restaurantTimezone || "Europe/Paris")
      .locale(language)
      .format("dddd DD/MM/YYYY HH:mm"),
    paymentMethod: t("receipt.payment_method", { method: order.methodLabel }),
    productLabel: t("receipt.product"),
    priceLabel: t("receipt.price"),
    extrasLabel: t("receipt.extras"),
    products: order.products.map((product) => {
      const count = Number(product.plat.count) || 1;
      const variationPrice = Number(product.variation?.price) || 0;
      const addons = (product.addons || [])
        .filter((addon) => addon.name)
        .map((addon) => {
          const addonCount = Number(addon.count) || 1;
          const price = Number(addon.price) || 0;
          return {
            name: lineLabel(String(addon.name), addonCount, "X"),
            price: price > 0 ? money(price) : "",
          };
        });
      const extras = (product.extras || [])
        .filter((extra) => extra.name)
        .map((extra) => {
          const extraCount = Number(extra.count) || 1;
          return {
            name: lineLabel(String(extra.name), extraCount, "X"),
            price: money(Number(extra.price) || 0),
          };
        });
      return {
        name: lineLabel(product.plat.name, count, "X"),
        price: money(Number(product.plat.price) || 0),
        variation: product.variation?.name
          ? {
              name: product.variation.name,
              price: variationPrice > 0 ? money(variationPrice * count) : "",
            }
          : null,
        addons,
        extras,
        showExtras: extras.length > 0,
      };
    }),
    tvaLabel: t("receipt.tva", { percent: tva }),
    tvaAmount: money(tvaAmount),
    htLabel: t("receipt.total_ht"),
    ht: money(ht),
    showReductions: Boolean(discount) || loyalty > 0,
    subtotalLabel: t("receipt.subtotal"),
    subtotal: money(subtotal),
    discount,
    discountLabel: t("receipt.discount"),
    loyalty: loyalty > 0 ? `-${money(loyalty)}` : "",
    loyaltyLabel: t("receipt.loyalty"),
    totalLabel: t("receipt.total"),
    total: money(paid),
    currency: order.currency || "",
    thankYou: t("receipt.thank_you"),
    seeYou: t("receipt.see_you_soon"),
    qr,
  });

  const browser = await sharedBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 302, height: 800 });
    await page.setContent(html, { waitUntil: "load" });
    const height = Number(
      await page.evaluate("Math.ceil(document.documentElement.scrollHeight)")
    );
    const pdf = await page.pdf({
      width: "80mm",
      height: `${Math.max(height, 1)}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      pageRanges: "1",
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
};

export const generatePDF = async (orderData: PdfOrderData) => {
  const { restaurantId } = orderData;

  // TODO: Legacy behavior preserved during TS migration.
  const req = undefined as unknown as Request;

  if (!restaurantId) {
    throw new Error(req.t("history.restaurant_id_not_found"));
  }
  const html = fs.readFileSync(
    path.join(paths.template, "pdf.handlebars"),
    "utf8"
  );
  const settings = await Settings.findOne({ restaurantId });
  const restaurant = (await Restaurant.findById(restaurantId).populate({
    path: "logo",
    select: "url",
  })) as (RestaurantWithLogo & { name: string; address: string }) | null;
  const tva = settings?.tva || 0;
  const address = restaurant?.address;
  // const totalHt = (100 * orderData.total) / (100 + tva);
  // const tvaAmount = orderData.total - totalHt;
  let totalHT = 0;
  let totalTVA = 0;
  const safeRestaurantName = restaurant!.name
    .replace(/[\s'"]/g, "-")
    .replace(/--+/g, "-");
  const logoUrl = `${env.mediaServerUrl}/${restaurant!.logo!.url!.replace(
    /\\/g,
    "/"
  )}`;
  const formattedDate = dayjs(orderData.boughtAt)
    .tz(env.restaurantTimezone || "Europe/Paris")
    .format("D MMMM YYYY HH:mm");
  const pdfFontCss = `
    body {
      font-family: Arial, sans-serif;
      font-style: normal;
    }
    * {
      font-style: normal !important;
      font-family: Arial, sans-serif !important;
    }
  `;

  orderData.product.forEach((product) => {
    const productTotal = Number(product.total) || 0;
    const productTva = product.tva && product.tva > 0 ? product.tva : tva;

    const productHT = (100 * productTotal) / (100 + productTva);
    const productTVA = productTotal - productHT;

    totalHT += productHT;
    totalTVA += productTVA;
  });
  const templateData = {
    name: orderData.name,
    apiUrl: env.baseUrl,
    commandNumber: orderData.commandNumber,
    boughtAt: formattedDate,
    products: orderData.product.map((product) => {
      return {
        platName: product.plat.name,
        price: (product.plat.price as number).toFixed(2),
        currency: orderData.currency,
        count: product.plat.count,
        variation: product.variation
          ? {
              ...product.variation,
              price: Number(product.variation.price).toFixed(2),
            }
          : null,
        addons: product.addons!.map((addon) => ({
          name: addon.name,
          count: addon.count,
          price: (addon.price as number).toFixed(2),
          currency: orderData.currency,
        })),
        extras: product.extras!.map((extra) => ({
          name: extra.name,
          count: extra.count,
          price: (extra.price as number).toFixed(2),
          currency: orderData.currency,
        })),
      };
    }),
    total: orderData.total.toFixed(2),
    loyaltyDiscount:
      orderData.loyaltyDiscount && orderData.loyaltyDiscount > 0
        ? Number(orderData.loyaltyDiscount).toFixed(2)
        : "",
    tva: tva,
    totalHt: totalHT.toFixed(2),
    tvaAmount: totalTVA.toFixed(2),
    logo: logoUrl,
    address: address!.split("\n"),
    pack: orderData.pack.label,
    method: orderData.method.label,
    currency: orderData.currency,
    restaurantId: restaurantId,
  };

  const outputPath = `./uploads/${safeRestaurantName}-commande-${orderData.commandNumber}.pdf`;

  try {
    const renderedHtml = Handlebars.compile(html)(templateData);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(renderedHtml, { waitUntil: "load" });
      await page.addStyleTag({ content: pdfFontCss });
      await page.pdf({
        path: outputPath,
        format: "A4",
        landscape: false,
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "20mm", left: "10mm" },
      });
    } finally {
      await browser.close();
    }

    return outputPath;
  } catch (error: unknown) {
    console.error(req.t("history.pdf_generation_error"), error);
    throw error;
  }
};
