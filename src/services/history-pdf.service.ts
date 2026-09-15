import type { Request } from "express";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import { Settings } from "../models/settings.model";
import { Restaurant } from "../models/restaurant.model";
import { env } from "../config/environment";
import { paths } from "../config/paths";
import type { PdfOrderData, RestaurantWithLogo } from "../interfaces/history.interface";

dayjs.extend(utc);
dayjs.extend(timezone);

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
