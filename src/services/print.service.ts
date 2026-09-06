import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { History } from "../models/history.model";
import { Settings } from "../models/settings.model";
import { Restaurant } from "../models/restaurant.model";
import { env } from "../config/environment";
import { errorMessage } from "../utils/helpers";
import { getHistoryIO } from "./history-io";
import type {
  AddonGroup,
  ExtraGroup,
  FailedPrintJob,
  PrintJobData,
  PrintOrder,
  PrintRestaurant,
  PrintSettings,
} from "../interfaces/history.interface";

dayjs.extend(utc);
dayjs.extend(timezone);

let failedPrintQueue: FailedPrintJob[] = [];

const PRINTER_SERVER_URL = env.printerServerUrl || "http://localhost:3301";
const MAX_PRINT_RETRIES = 5;
const RETRY_INTERVAL = 30000; // 30 seconds

function formatLine(left: string | number, right: string | number, lineWidth = 45) {
  const leftText = left.toString();
  const rightText = right.toString();
  const spaceCount = lineWidth - leftText.length - rightText.length;
  const spaces = " ".repeat(Math.max(spaceCount, 1)); // prevent overlap
  return `${leftText}${spaces}${rightText}`;
}
function alignLeftRightWide(left: string | number, right: string | number, lineWidth = 24) {
  const leftStr = left.toString();
  const rightStr = right.toString();
  const spaces = Math.max(1, lineWidth - leftStr.length - rightStr.length);
  return leftStr + " ".repeat(spaces) + rightStr;
}
function padLine(label: string, price: string | number, totalWidth = 45) {
  const left = label;
  const right = price.toString();
  const space = totalWidth - left.length - right.length;
  return `${left}${" ".repeat(Math.max(0, space))}${right}`;
}
// Convert order to print format - STEP 3: COMPLETE FLUTTER FORMAT
function formatOrderForPrint(
  order: PrintOrder,
  restaurant: PrintRestaurant,
  settings: PrintSettings
) {
  const tva = order.tva || 0;
  // const totalHT = (100 * order.total) / (100 + tva);
  // const tvaAmount = order.total - totalHT;
  let totalHT = 0;
  let tvaAmount = 0;
  order.product.forEach((product) => {
    const productTotal = Number(product.total) || 0;
    const productTva =
      product.tva && product.tva > 0
        ? product.tva
        : order.tva || settings?.tva || 0;

    const productHT = (100 * productTotal) / (100 + productTva);
    const productTVA = productTotal - productHT;

    totalHT += productHT;
    tvaAmount += productTVA;
  });
  const currencySymbol = order.currency === "€" ? "€" : order.currency;

  let productList = "";

  // Add products with entry numbers like Flutter
  order.product.forEach((product, index) => {
    const entryNumber = `${index + 1}/${order.product.length}`;
    const productName = `${
      (product.plat.count as number) > 1 ? product.plat.count + " X " : ""
    }${product.plat.name}`;
    const productPrice = (
      (product.plat.price as number) * (product.plat.count as number)
    ).toFixed(2);
    const rightSide = `${entryNumber}   ${productPrice}`;
    const formattedLine = formatLine(productName, rightSide);
    productList += `<text em="true">${formattedLine}</text>`;
    productList += `<feed line="1"/>`;
    const hasVariation = product.variation && product.variation.name;
    const hasAddons = product.addons && product.addons.length > 0;
    const hasExtras = product.extras && product.extras.length > 0;
    if (hasVariation || hasAddons || hasExtras) {
      productList += `<text align="center">-------------------------------</text>`;
      productList += `<feed line="1"/>`;
    }
    // productList += `<text align="center">-------------------------------</text>`;
    // productList += `<feed line="1"/>`;

    // Add variation if exists
    if (product.variation && product.variation.name) {
      const variationPrice =
        product.variation.price == 0
          ? ""
          : ((product.plat.count as number) * Number(product.variation.price)).toFixed(2);
      // productList += `<text> ${product.variation.name}                  </text>`;

      if (variationPrice) {
        const formattedLine = formatLine(product.variation.name, variationPrice);
        productList += `<text em="false" align="left">${formattedLine}</text>`;
      } else {
        productList += `<text em="false" align="left">${product.variation.name}</text>`;
      }
      productList += `<feed line="1"/>`;
    }

    if (product.addons && product.addons.length > 0) {
      const addonGroups: Record<string, AddonGroup> = {};
      product.addons.forEach((addon) => {
        const name = addon.name || "Addon";
        const price = parseFloat(String(addon.price)) || 0;
        const key = `${name}_${price}`;
        const addonCount = Number(addon.count) || 1;

        if (!addonGroups[key]) {
          addonGroups[key] = { name: name, price: price, count: 0 };
        }
        addonGroups[key].count += addonCount;
      });

      Object.values(addonGroups).forEach((addon) => {
        const addonName = `${addon.count > 1 ? " " + addon.count + "X " : " "}${
          addon.name
        }`;
        const addonPrice = addon.price === 0 ? "" : addon.price.toFixed(2);
        // productList += `<text>${addonName}                   </text>`;
        if (addonPrice) {
          const formattedLine = formatLine(addonName, addonPrice); // aligned
          productList += `<text align="left" em="false">${formattedLine}</text>`;
        } else {
          productList += `<text align="left" em="false">${addonName}</text>`; // just name
        }
        productList += `<feed line="1"/>`;
      });
    }

    if (product.extras && product.extras.length > 0) {
      productList += `<text align="left" em="true">Extras:</text>`;
      productList += `<feed line="1"/>`;
      const extraGroups: Record<string, ExtraGroup> = {};
      product.extras.forEach((extra) => {
        const name = extra.name || "Extra";
        const price = parseFloat(String(extra.price)) || 0;

        if (!extraGroups[name]) {
          extraGroups[name] = { name: name, price: price, count: 0 };
        }
        extraGroups[name].count++;
      });

      Object.values(extraGroups).forEach((extra) => {
        const extraName = `${extra.count > 1 ? " " + extra.count + "X " : " "}${
          extra.name
        }`;
        const extraPrice = (
          (product.plat.count as number) *
          extra.count *
          extra.price
        ).toFixed(2);
        const formattedLine = formatLine(extraName, extraPrice);
        productList += `<text width="1" height="1" em="false">${formattedLine}</text>`;
        productList += `<feed line="1"/>`;
      });
    }

    // Add separator between products
    if (index < order.product.length - 1) {
      productList += `<text>-----------------------------------------------</text>`;
      productList += `<feed line="1"/>`;
    }
  });

  // --- Kitchen Ticket ---
  let kitchenProductList = "";
  order.product.forEach((product, index) => {
    const entryNumber = `${index + 1}/${order.product.length}`;
    const productName = `${
      (product.plat.count as number) > 1 ? product.plat.count + " X " : ""
    }${product.plat.name}`;
    // kitchenProductList += `<text width="2" height="2">${productName}</text>`;
    // kitchenProductList += `<text width="2" height="2" align="right">${entryNumber}</text>`;
    // kitchenProductList += `<feed line="1"/>`;
    const line = alignLeftRightWide(productName, entryNumber, 24);
    kitchenProductList += `<text width="1" height="1">-----------------------------------------------</text>`;
    kitchenProductList += `<feed line="1"/>`;
    kitchenProductList += `<text width="2" height="2" em="true">${line}</text>\n<feed line="2"/>`;
    kitchenProductList += `<text width="1" height="1">-----------------------------------------------</text>`;
    kitchenProductList += `<feed line="1"/>`;
    // Variation
    if (product.variation && product.variation.name) {
      kitchenProductList += `<text width="2" height="2" align="left" em="false">${product.variation.name}</text>`;
      kitchenProductList += `<feed line="1"/>`;
    }

    // Addons
    if (product.addons && product.addons.length > 0) {
      const addonGroups: Record<string, AddonGroup> = {};
      product.addons.forEach((addon) => {
        const name = addon.name || "Addon";
        const price = parseFloat(String(addon.price)) || 0;
        const key = `${name}_${price}`;

        const addonCount = Number(addon.count) || 1;
        if (!addonGroups[key]) {
          addonGroups[key] = { name: name, price: price, count: 0 };
        }
        addonGroups[key].count += addonCount;
      });

      Object.values(addonGroups).forEach((addon) => {
        const addonName = `${addon.count > 1 ? addon.count + "X " : ""}${
          addon.name
        }`;
        // No price display for kitchen
        kitchenProductList += `<text width="2" height="2" align="left" em="false">${addonName}</text>`;
        kitchenProductList += `<feed line="1"/>`;
      });
    }

    // Extras
    if (product.extras && product.extras.length > 0) {
      kitchenProductList += `<text width="2" height="2" align="left" em="true">Extras:</text>`;
      kitchenProductList += `<feed line="1"/>`;
      const uniqueExtras = [
        ...new Map(product.extras.map((e) => [e.name, e])).values(),
      ];
      uniqueExtras.forEach((extra) => {
        const count = product.extras!.filter((e) => e.name === extra.name).length;
        kitchenProductList += `<text width="2" height="2" align="left" em="false"> ${
          count > 1 ? count + "X " : ""
        }${extra.name}</text>`;
        kitchenProductList += `<feed line="1"/>`;
      });
    }

    // if (index < order.product.length - 1) {
    //   kitchenProductList += `<text width="1" height="1" em="false"></text>`;
    //   kitchenProductList += `<text>-----------------------------------------------</text><feed line="1"/>`;
    // }
  });

  return `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
<text align="left" em="true">${restaurant.name}</text>
<feed line="1"/>
<text em="false">${restaurant.address.replace(/\n/g, " ")}</text>
<feed line="2"/>
<text reverse="true" width="2" height="2">${alignLeftRightWide(
    "#" + order.commandNumber,
    order.pack.label,
    24
  )}</text>
<feed line="3"/>
<text width="2" height="2" align="left" reverse="true">${order.name}</text>
<feed line="3"/>
<text width="1" height="1" align="left" reverse="false"/>
<text>${new Date(order.boughtAt).toLocaleDateString("fr-FR", {
    weekday: "long",
  })}: ${new Date(order.boughtAt).toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}</text>
<feed line="2"/>
<text em="true">Méthode de paiement: ${order.method.label}</text>
<feed line="2"/>
<text em="true">${padLine("Produits", "Prix")}</text>
<feed line="1"/>
<text em="false" width="1" height="1"/>
<text>-----------------------------------------------</text>
<feed line="1"/>
${productList}
<feed line="1"/>
<text>===============================================</text>
<feed line="1"/>
<text em="false" align="left">${formatLine(
    `TVA(${tva}%)`,
    tvaAmount.toFixed(2)
  )}</text>
<feed line="1"/>
${
  order.discountValue && order.couponId
    ? `<text align="left">${formatLine(
        "Remise",
        order.couponId.couponType === "percentage"
          ? "-" + order.discountValue + " %"
          : "-" + order.discountValue + " " + currencySymbol
      )}</text><feed line="1"/>`
    : ""
}
<text>${formatLine("Total(HT)", totalHT.toFixed(2))}</text>
<feed line="1"/>
<text>===============================================</text>
<feed line="1"/>
<text em="true">${formatLine(
    "Total",
    order.total.toFixed(2) + " " + currencySymbol
  )}</text>
<feed line="2"/>

<text em="false" align="center">Merci de nous laisser 5 étoiles sur Google SVP:)</text>
<text>À très vite !</text>
<feed line="1"/>
<symbol type="qrcode_model_2" level="level_l" width="7" height="7" align="center">${
    settings.qrCode
  }</symbol>
<feed line="1"/>
<text align="center" em="true" >Powered by LayaFood</text>
<feed line="2"/>
<cut/>
<text reverse="true" width="2" height="2" >${alignLeftRightWide(
    "#" + order.commandNumber,
    order.pack.label,
    24
  )}</text>
<feed line="3"/>
<text width="2" height="2" align="left" reverse="true">${order.name}</text>
<feed line="3"/>
<text width="1" height="1" align="left" reverse="false" em="false">${new Date(
    order.boughtAt
  ).toLocaleString("fr-FR")}</text>
<feed line="2"/>
${kitchenProductList}
<feed line="2"/>
<cut/>
</epos-print>`;
}

// Send print job to printer server
async function sendToPrinterServer(
  printData: PrintJobData,
  printerServerUrl = PRINTER_SERVER_URL
) {
  const response = await fetch(`${printerServerUrl}/api/printer/add-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(printData),
    timeout: 5000, // 5 second timeout
  } as RequestInit & { timeout: number });

  if (!response.ok) {
    throw new Error(
      `Printer server responded with status: ${response.status} at URL: ${printerServerUrl}/api/printer/add-order`
    );
  }

  return response.json();
}

// Auto-print function (non-blocking)
export async function triggerAutoPrint(orderId: mongoose.Types.ObjectId | string) {
  try {
    const order = await History.findById(orderId).populate("couponId", "couponType");
    if (!order) {
      console.error(`❌ Order with ID ${orderId} not found`);
      return;
    }
    const settings = await Settings.findOne({
      restaurantId: order.restaurantId,
    });
    const restaurant = await Restaurant.findById(order.restaurantId);

    if (!settings || !restaurant) {
      console.error(
        `❌ Settings or restaurant not found for order ${order.commandNumber}`
      );
      return;
    }
    const printData: PrintJobData = {
      restaurantId: order.restaurantId,
      orderId: order._id,
      commandNumber: order.commandNumber,
      customerName: order.name,
      source: "Auto", // You can track source (Kiosk/Mobile/Cashier) here
      createdAt: order.boughtAt,
      items: order.product,
      total: order.total,
      pack: order.pack,
      method: order.method,
      printXml: formatOrderForPrint(
        order as unknown as PrintOrder,
        restaurant,
        settings
      ),
    };

    if (settings.printMode === true) {
      await sendToPrinterServer(printData);

      // Success - update print status
      // TODO: Legacy behavior preserved during TS migration.
      await History.findByIdAndUpdate(order._id, {
        printStatus: "printed",
        lastPrintAttempt: dayjs().tz("Europe/Paris").toDate(),
      });

      // Notify via WebSocket
      if (getHistoryIO()) {
        getHistoryIO()!.emit("print_success", {
          orderId: order._id,
          commandNumber: order.commandNumber,
          message: "Commande imprimée avec succès",
        });
      }
    } else {
      // Print mode is local, skip auto print
      // TODO: Legacy behavior preserved during TS migration.
      await History.findByIdAndUpdate(order._id, {
        printStatus: "skipped",
        lastPrintAttempt: dayjs().tz("Europe/Paris").toDate(),
      });
      if (getHistoryIO()) {
        getHistoryIO()!.emit("print_skipped", {
          orderId: order._id,
          commandNumber: order.commandNumber,
          message: "Impression automatique désactivée (mode local)",
        });
      }
    }
  } catch (error: unknown) {
    console.error(`❌ Failed to print order ID ${orderId}:`, errorMessage(error));
    let order;
    try {
      order = await History.findById(orderId);
    } catch (findError: unknown) {
      console.error(`❌ Could not find order ${orderId} for error handling`);
      return;
    }
    // Queue for retry
    if (order) {
      await queueFailedPrint(order, errorMessage(error));

      // Notify via WebSocket
      if (getHistoryIO()) {
        getHistoryIO()!.emit("print_failed", {
          orderId: order._id,
          commandNumber: order.commandNumber,
          error: errorMessage(error),
          message: "Échec d'impression - nouvel essai automatique",
        });
      }
    }
  }
}

// Queue failed print for background retry
async function queueFailedPrint(
  order: {
    _id: mongoose.Types.ObjectId;
    restaurantId: mongoose.Types.ObjectId;
    commandNumber?: number;
  },
  printErrorMessage: string
) {
  try {
    const settings = await Settings.findOne({
      restaurantId: order.restaurantId,
    });
    // Update order status
    // TODO: Legacy behavior preserved during TS migration.
    await History.findByIdAndUpdate(order._id, {
      printStatus: "failed",
      lastPrintAttempt: dayjs().tz("Europe/Paris").toDate(),
      printError: printErrorMessage,
    });

    // Add to retry queue
    if (settings!.printMode === true) {
      const retryJob: FailedPrintJob = {
        orderId: order._id,
        commandNumber: order.commandNumber,
        restaurantId: order.restaurantId,
        attempts: 0,
        nextRetry: dayjs()
          .tz("Europe/Paris")
          .add(RETRY_INTERVAL, "millisecond")
          .toDate(),
        error: printErrorMessage,
        createdAt: dayjs().tz("Europe/Paris").toDate(),
      };

      failedPrintQueue.push(retryJob);
    }
  } catch (error: unknown) {
    console.error("Error queuing failed print:", error);
  }
}

// Background worker for print retries
export function startPrintRetryWorker() {
  setInterval(async () => {
    const now = dayjs().tz("Europe/Paris").toDate();
    const jobsToRetry = failedPrintQueue.filter(
      (job) => job.nextRetry <= now && job.attempts < MAX_PRINT_RETRIES
    );

    for (const job of jobsToRetry) {
      const settings = await Settings.findOne({
        restaurantId: job.restaurantId,
      });
      try {
        if (settings!.printMode === true) {
          await triggerAutoPrint(job.orderId);

          // Success - remove from queue
          const index = failedPrintQueue.indexOf(job);
          if (index > -1) {
            failedPrintQueue.splice(index, 1);
          }
        }
      } catch (error: unknown) {
        // Failed again - update retry info
        job.attempts++;
        job.nextRetry = new Date(
          Date.now() + RETRY_INTERVAL * Math.pow(2, job.attempts)
        ); // Exponential backoff
        job.error = errorMessage(error);

        if (job.attempts >= MAX_PRINT_RETRIES) {
          console.error(`💀 Order #${job.orderId} exceeded max retry attempts`);

          // Update final status
          // TODO: Legacy behavior preserved during TS migration.
          await History.findByIdAndUpdate(job.orderId, {
            printStatus: "retry_exhausted",
            printError: `Max retries exceeded: ${errorMessage(error)}`,
          });

          // Notify admin via WebSocket
          if (getHistoryIO()) {
            getHistoryIO()!.emit("print_retry_exhausted", {
              orderId: job.orderId,
              commandNumber: job.commandNumber,
              error: errorMessage(error),
              message: "Impression échouée - intervention manuelle requise",
            });
          }
        }
      }
    }

    // Clean up completed/exhausted jobs
    failedPrintQueue = failedPrintQueue.filter(
      (job) => job.attempts < MAX_PRINT_RETRIES
    );
  }, RETRY_INTERVAL);
}

export const getFailedPrintQueue = () => failedPrintQueue;

export const removeFailedPrintJob = (orderId: string) => {
  const jobIndex = failedPrintQueue.findIndex(
    (job) => job.orderId.toString() === orderId
  );
  if (jobIndex > -1) {
    failedPrintQueue.splice(jobIndex, 1);
  }
};

export const removeFailedPrintJobsByRestaurant = (restaurantId: string) => {
  failedPrintQueue = failedPrintQueue.filter(
    (job) => job.restaurantId.toString() !== restaurantId
  );
};
