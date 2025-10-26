const History = require("../models/History");
const Coupon = require("../models/coupon");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const createTransporter = require("../middleware/email");
var pdf = require("pdf-creator-node");
const path = require("path");
var fs = require("fs");
const Settings = require("../models/settings");
let io;
var admin = require("firebase-admin");
var serviceAccount = require("../config/push-notification-key.json");
const User = require("../models/user");
const StatusHistory = require("../models/statusHistory");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const Restaurant = require("../models/restaurant");
const settings = require("../models/settings");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// In-memory queue for failed print jobs (for production, use database)
let failedPrintQueue = [];

// Auto-print configuration
const PRINTER_SERVER_URL =
  process.env.PRINTER_SERVER_URL || "http://localhost:3301";
const MAX_PRINT_RETRIES = 5;
const RETRY_INTERVAL = 30000; // 30 seconds

exports.setIO = (socketIO) => {
  io = socketIO;

  // Start background worker for failed print retries
  startPrintRetryWorker();
};

function formatLine(left, right, lineWidth = 45) {
  const leftText = left.toString();
  const rightText = right.toString();
  const spaceCount = lineWidth - leftText.length - rightText.length;
  const spaces = " ".repeat(Math.max(spaceCount, 1)); // prevent overlap
  return `${leftText}${spaces}${rightText}`;
}
function alignLeftRightWide(left, right, lineWidth = 24) {
  const leftStr = left.toString();
  const rightStr = right.toString();
  const spaces = Math.max(1, lineWidth - leftStr.length - rightStr.length);
  return leftStr + " ".repeat(spaces) + rightStr;
}
function padLine(label, price, totalWidth = 45) {
  const left = label;
  const right = price.toString();
  const space = totalWidth - left.length - right.length;
  return `${left}${" ".repeat(Math.max(0, space))}${right}`;
}
// Convert order to print format - STEP 3: COMPLETE FLUTTER FORMAT
function formatOrderForPrint(order, restaurant, settings) {
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
      product.plat.count > 1 ? product.plat.count + " X " : ""
    }${product.plat.name}`;
    const productPrice = (product.plat.price * product.plat.count).toFixed(2);
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
          : (product.plat.count * product.variation.price).toFixed(2);
      // productList += `<text> ${product.variation.name}                  </text>`;

      if (variationPrice) {
        const formattedLine = formatLine(
          product.variation.name,
          variationPrice
        );
        productList += `<text em="false" align="left">${formattedLine}</text>`;
      } else {
        productList += `<text em="false" align="left">${product.variation.name}</text>`;
      }
      productList += `<feed line="1"/>`;
    }

    if (product.addons && product.addons.length > 0) {
      const addonGroups = {};
      product.addons.forEach((addon) => {
        const name = addon.name || "Addon";
        const price = parseFloat(addon.price) || 0;
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
      const extraGroups = {};
      product.extras.forEach((extra) => {
        const name = extra.name || "Extra";
        const price = parseFloat(extra.price) || 0;

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
          product.plat.count *
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
      product.plat.count > 1 ? product.plat.count + " X " : ""
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
      const addonGroups = {};
      product.addons.forEach((addon) => {
        const name = addon.name || "Addon";
        const price = parseFloat(addon.price) || 0;
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
        const count = product.extras.filter(
          (e) => e.name === extra.name
        ).length;
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
  printData,
  printerServerUrl = PRINTER_SERVER_URL
) {
  const response = await fetch(`${printerServerUrl}/api/printer/add-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(printData),
    timeout: 5000, // 5 second timeout
  });

  if (!response.ok) {
    throw new Error(
      `Printer server responded with status: ${response.status} at URL: ${printerServerUrl}/api/printer/add-order`
    );
  }

  return response.json();
}

// Auto-print function (non-blocking)
async function triggerAutoPrint(orderId) {
  try {
    const order = await History.findById(orderId).populate(
      "couponId",
      "couponType"
    );
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
    const printData = {
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
      printXml: formatOrderForPrint(order, restaurant, settings),
    };

    if (settings.printMode === true) {
      await sendToPrinterServer(printData);

      // Success - update print status
      await History.findByIdAndUpdate(order._id, {
        printStatus: "printed",
        lastPrintAttempt: new Date(),
      });

      // Notify via WebSocket
      if (io) {
        io.emit("print_success", {
          orderId: order._id,
          commandNumber: order.commandNumber,
          message: "Commande imprimée avec succès",
        });
      }
    } else {
      // Print mode is local, skip auto print
      await History.findByIdAndUpdate(order._id, {
        printStatus: "skipped",
        lastPrintAttempt: new Date(),
      });
      if (io) {
        io.emit("print_skipped", {
          orderId: order._id,
          commandNumber: order.commandNumber,
          message: "Impression automatique désactivée (mode local)",
        });
      }
    }
  } catch (error) {
    console.error(`❌ Failed to print order ID ${orderId}:`, error.message);
    let order;
    try {
      order = await History.findById(orderId);
    } catch (findError) {
      console.error(`❌ Could not find order ${orderId} for error handling`);
      return;
    }
    // Queue for retry
    if (order) {
      await queueFailedPrint(order, error.message);

      // Notify via WebSocket
      if (io) {
        io.emit("print_failed", {
          orderId: order._id,
          commandNumber: order.commandNumber,
          error: error.message,
          message: "Échec d'impression - nouvel essai automatique",
        });
      }
    }
  }
}

// Queue failed print for background retry
async function queueFailedPrint(order, errorMessage) {
  try {
    const settings = await Settings.findOne({
      restaurantId: order.restaurantId,
    });
    // Update order status
    await History.findByIdAndUpdate(order._id, {
      printStatus: "failed",
      lastPrintAttempt: new Date(),
      printError: errorMessage,
    });

    // Add to retry queue
    if (settings.printMode === true) {
      const retryJob = {
        orderId: order._id,
        commandNumber: order.commandNumber,
        restaurantId: order.restaurantId,
        attempts: 0,
        nextRetry: new Date(Date.now() + RETRY_INTERVAL),
        error: errorMessage,
        createdAt: new Date(),
      };

      failedPrintQueue.push(retryJob);
    }
  } catch (error) {
    console.error("Error queuing failed print:", error);
  }
}

// Background worker for print retries
function startPrintRetryWorker() {
  setInterval(async () => {
    const now = new Date();
    const jobsToRetry = failedPrintQueue.filter(
      (job) => job.nextRetry <= now && job.attempts < MAX_PRINT_RETRIES
    );

    for (const job of jobsToRetry) {
      const settings = await Settings.findOne({
        restaurantId: job.restaurantId,
      });
      try {
        if (settings.printMode === true) {
          await triggerAutoPrint(job.orderId);

          // Success - remove from queue
          const index = failedPrintQueue.indexOf(job);
          if (index > -1) {
            failedPrintQueue.splice(index, 1);
          }
        }
      } catch (error) {
        // Failed again - update retry info
        job.attempts++;
        job.nextRetry = new Date(
          Date.now() + RETRY_INTERVAL * Math.pow(2, job.attempts)
        ); // Exponential backoff
        job.error = error.message;

        if (job.attempts >= MAX_PRINT_RETRIES) {
          console.error(`💀 Order #${job.orderId} exceeded max retry attempts`);

          // Update final status
          await History.findByIdAndUpdate(job.orderId, {
            printStatus: "retry_exhausted",
            printError: `Max retries exceeded: ${error.message}`,
          });

          // Notify admin via WebSocket
          if (io) {
            io.emit("print_retry_exhausted", {
              orderId: job.orderId,
              commandNumber: job.commandNumber,
              error: error.message,
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
exports.addHistory = async (req, res) => {
  const {
    products,
    pack,
    name,
    method,
    total,
    currency,
    commandNumber,
    discountValue,
    couponId,
  } = req.body;
  const { restaurantId } = req;
  try {
    const restaurant = await Restaurant.findById(restaurantId);
    const settings = await Settings.findOne({ restaurantId });
    const parisTime = moment.tz("Europe/Paris");
    const franceDatetime = parisTime.toDate();

    const methodExists = settings.method.find(
      (m) => m._id.toString() === method
    );
    const packExists = settings.pack.find((p) => p._id.toString() === pack);
    if (!packExists || !packExists.isActive) {
      return res
        .status(404)
        .json({ message: req.t("history.delivery_mode_not_found") });
    }
    if (!methodExists || !methodExists.isActive) {
      return res
        .status(404)
        .json({ message: req.t("history.payment_method_not_found") });
    }
    const tva = settings?.tva || 0;
    const history = await new History({
      product: products.map((product) => {
        const productTva =
          product.tva && product.tva > 0 ? product.tva : settings?.tva || 0;
        return {
          plat: product.plat,
          variation: product.variation
            ? {
                ...product.variation,
                price: Number(product.variation.price).toFixed(2),
              }
            : null,
          total: product.total,
          addons: product.addons.map((addon) => ({
            name: addon.name,
            price: addon.price,
            count: addon.count,
          })),
          extras: product.extras.map((extra) => ({
            name: extra.name,
            price: extra.price,
            count: extra.count,
          })),
          tva: productTva,
        };
      }),
      name,
      currency,
      tva,
      discountValue: discountValue || 0,
      couponId: couponId || null,
      status: "enCours",
      logo: restaurant.logo,
      method: {
        _id: methodExists._id,
        label: methodExists.label,
      },
      pack: {
        _id: packExists._id,
        label: packExists.label,
      },
      total: total,
      boughtAt: franceDatetime,
      commandNumber: parseInt(commandNumber, 10),
      restaurantId,
    });
    history
      .save()
      .then(async (result) => {
        const statusHistory = new StatusHistory({
          historyId: result._id,
          status: "enCours",
          updatedBy: "Système",
          updatedAt: franceDatetime,
          restaurantId,
        });

        await statusHistory.save();

        const coupon = await Coupon.findById(couponId);
        if (coupon) {
          coupon.usageCount += 1;
          if (coupon.usageCount >= coupon.limit) {
            coupon.isActive = false;
          }
          await coupon.save();
        }

        const response = {
          ...result.toObject(),
          pack: result.pack.label,
          method: result.method.label,
        };
        if (io) {
          io.emit("status-update", {
            id: result._id,
            status: "enCours",
            updatedAt: franceDatetime,
          });
          io.to(`restaurant-${restaurantId}`).emit("new-history", response);
          await notifyWaiters(history, req.t.bind(req));
        }

        // 🚀 AUTO-PRINT: Trigger printing immediately after order is saved (non-blocking)
        setImmediate(() => triggerAutoPrint(result._id));

        setTimeout(async () => {
          const order = await History.findOne({
            _id: result._id,
            restaurantId,
          });
          if (order && order.status === "enCours") {
            const updatedOrder = await History.findOneAndUpdate(
              { _id: order._id, restaurantId },
              { status: "enRetard" },
              { new: true }
            );

            if (io) {
              io.emit("status-update", {
                id: order._id,
                status: "enRetard",
                updatedAt: new Date(),
              });
            }
          }
        }, 20 * 60 * 1000);
        setInterval(
          () => checkAndUpdateDelayedOrders(restaurantId),
          20 * 60 * 1000
        );
        res.status(201).json(response);
      })
      .catch((err) => {
        console.error(req.t("history.save_error_log"), err);
        res.status(500).json({
          message: req.t("history.save_error"),
          error: err,
        });
      });
  } catch (error) {
    console.error(req.t("history.save_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

const notifyWaiters = async (history, t) => {
  try {
    const { restaurantId } = history;
    const users = await User.find({
      fcmToken: { $ne: "" },
      restaurants: { $elemMatch: { restaurantId } },
    });

    const tokens = users.map((user) => user.fcmToken);
    const payload = {
      notification: {
        title: t("history.new_order_title"),
        body: t("history.new_order_body", {
          name: history.name,
          commandNumber: history.commandNumber,
        }),
      },
    };

    for (const token of tokens) {
      try {
        await admin.messaging().send({
          ...payload,
          token,
        });
      } catch (error) {
        console.error(t("history.notification_token_error", { token }), error);
      }
    }
  } catch (error) {
    console.error(t("history.notification_send_error"), error);
  }
};
exports.getHistory = async (req, res) => {
  try {
    const { restaurantId } = req;
    const {
      page = 1,
      limit = 10,
      search = "",
      filter = "all",
      status,
      packId,
      methodId,
      startDate,
      endDate,
    } = req.query;
    const skip = (page - 1) * parseInt(limit);
    let query = { restaurantId };

    // Add search filter if provided
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { name: { $regex: searchRegex } },
        { commandNumber: isNaN(parseInt(search)) ? -1 : parseInt(search) },
      ];
    }
    if (status) {
      query.status = status;
    }

    if (packId) query["pack._id"] = packId;

    if (methodId) query["method._id"] = methodId;

    const now = new Date();
    if (filter === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      query.boughtAt = { $gte: start, $lte: end };
    } else if (filter === "week") {
      const day = now.getDay() || 7; // Monday as start
      const start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      query.boughtAt = { $gte: start, $lte: end };
    } else if (filter === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      query.boughtAt = { $gte: start, $lte: end };
    } else if (filter === "custom" && (startDate || endDate)) {
      query.boughtAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.boughtAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.boughtAt.$lte = end;
      }
    }
    const histories = await History.find(query)
      .sort({ boughtAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: "product",
        populate: [
          {
            path: "plat.category",
            select: "name",
          },
        ],
      })
      .populate({
        path: "couponId",
        select: "couponType",
      })
      .lean();

    const historiesWithTva = histories.map((history) => {
      const globalTva = history.tva || 0;

      // const couponType = history.couponId
      //   ? await Coupon.findById(history.couponId).then((coupon) => (coupon ? coupon.type : null))
      //   : null;

      // if (Array.isArray(history.product) && history.product.length > 0) {
      //   history.product.forEach((p) => {
      //     const productTotal = Number(p.total) || 0;
      //     const productTva = p.tva && p.tva > 0 ? p.tva : globalTva;

      //     // Calculate HT (price without tax) for this product
      //     const productHT = (100 * productTotal) / (100 + productTva);
      //     const productTVA = productTotal - productHT;

      //     totalHT += productHT;
      //     totalTVA += productTVA;
      //   });
      // } else {
      //   // fallback (no detailed product list)
      //   totalHT = (100 * history.total) / (100 + globalTva);
      //   totalTVA = history.total - totalHT;
      // }
      const formattedBoughtAt = history.boughtAt
        ? moment(history.boughtAt).format("YYYY-MM-DD HH:mm:ss")
        : null;

      const { totalHT, tvaAmount } = history.product?.reduce(
        (acc, p) => {
          const productTotal = Number(p.total) || 0;
          const productTva = p.tva && p.tva > 0 ? p.tva : globalTva;

          const productHT = (100 * productTotal) / (100 + productTva);
          const productTVA = productTotal - productHT;

          acc.totalHT += productHT;
          acc.tvaAmount += productTVA;

          return acc;
        },
        { totalHT: 0, tvaAmount: 0 }
      ) || { totalHT: 0, tvaAmount: 0 };

      return {
        ...history,
        tvaAmount: parseFloat(tvaAmount.toFixed(2)),
        totalHT: parseFloat(totalHT.toFixed(2)),
        boughtAt: formattedBoughtAt,
      };
    });

    const totalHistories = await History.countDocuments({
      restaurantId,
      ...query,
    });

    res.status(200).json({
      histories: historiesWithTva,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalHistories / limit),
        totalRecords: totalHistories,
      },
    });
  } catch (error) {
    console.error(req.t("history.fetch_error_log"), error);
    res.status(500).json({
      message: req.t("history.fetch_error"),
      error: error.message,
    });
  }
};

exports.getLast10Orders = async (req, res) => {
  try {
    const { restaurantId } = req;
    const orders = await History.find({ restaurantId })
      .sort({ boughtAt: -1 })
      .limit(10)
      .populate("product.plat._id");

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({
      message: req.t("history.last10orders_error", { error: error.message }),
    });
    throw error;
  }
};

const generatePDF = async (orderData) => {
  const { restaurantId } = orderData;

  if (!restaurantId) {
    throw new Error(req.t("history.restaurant_id_not_found"));
  }
  const html = fs.readFileSync(
    path.join(__dirname, "../template/pdf.handlebars"),
    "utf8"
  );
  const settings = await Settings.findOne({ restaurantId });
  const restaurant = await Restaurant.findById(restaurantId);
  const tva = settings?.tva || 0;
  const address = restaurant?.address;
  // const totalHt = (100 * orderData.total) / (100 + tva);
  // const tvaAmount = orderData.total - totalHt;
  let totalHT = 0;
  let totalTVA = 0;
  const safeRestaurantName = restaurant.name
    .replace(/[\s'"]/g, "-")
    .replace(/--+/g, "-");
  const logoUrl = `${process.env.BASE_URL}/${restaurant.logo.replace(
    /\\/g,
    "/"
  )}`;
  let formattedDate = moment(orderData.boughtAt)
    .tz(process.env.RESTAURANT_TIMEZONE || "Europe/Paris")
    .format("D MMMM YYYY HH:mm");
  const options = {
    format: "A4",
    orientation: "portrait",
    border: "10mm",
    footer: {
      height: "10mm",
    },
    type: "pdf",
    localUrlAccess: true,
    childProcessOptions: {
      env: {
        OPENSSL_CONF: "/dev/null",
      },
    },
    css: `
      body {
        font-family: Arial, sans-serif;
        font-style: normal;
      }
      * {
        font-style: normal !important;
        font-family: Arial, sans-serif !important;
      }
    `,
  };

  orderData.product.forEach((product) => {
    const productTotal = Number(product.total) || 0;
    const productTva = product.tva && product.tva > 0 ? product.tva : tva;

    const productHT = (100 * productTotal) / (100 + productTva);
    const productTVA = productTotal - productHT;

    totalHT += productHT;
    totalTVA += productTVA;
  });
  const document = {
    html: html,
    data: {
      name: orderData.name,
      apiUrl: process.env.BASE_URL,
      commandNumber: orderData.commandNumber,
      boughtAt: formattedDate,
      products: orderData.product.map((product) => {
        return {
          platName: product.plat.name,
          price: product.plat.price.toFixed(2),
          currency: orderData.currency,
          count: product.plat.count,
          variation: product.variation
            ? {
                ...product.variation,
                price: Number(product.variation.price).toFixed(2),
              }
            : null,
          addons: product.addons.map((addon) => ({
            name: addon.name,
            count: addon.count,
            price: addon.price.toFixed(2),
            currency: orderData.currency,
          })),
          extras: product.extras.map((extra) => ({
            name: extra.name,
            count: extra.count,
            price: extra.price.toFixed(2),
            currency: orderData.currency,
          })),
        };
      }),
      total: orderData.total.toFixed(2),
      tva: tva,
      totalHt: totalHT.toFixed(2),
      tvaAmount: totalTVA.toFixed(2),
      logo: logoUrl,
      address: address.split("\n"),
      pack: orderData.pack.label,
      method: orderData.method.label,
      currency: orderData.currency,
      restaurantId: restaurantId,
    },
    path: `./uploads/${safeRestaurantName}-commande-${orderData.commandNumber}.pdf`,
  };

  try {
    await pdf.create(document, options);
    return document.path;
  } catch (error) {
    console.error(req.t("history.pdf_generation_error"), error);
    throw error;
  }
};

exports.addEmail = async (req, res) => {
  const { email, commandNumber } = req.body;
  const { restaurantId } = req;
  try {
    const history = await History.findOne({
      commandNumber: commandNumber,
      restaurantId,
    }).sort({
      boughtAt: -1,
    });
    if (!history) {
      return res
        .status(404)
        .json({ message: req.t("history.order_not_found") });
    }
    let formattedDate = moment(history.boughtAt)
      .tz(process.env.RESTAURANT_TIMEZONE || "Europe/Paris")
      .format("D MMMM YYYY HH:mm");
    const restaurant = await Restaurant.findById(restaurantId);
    const settings = await Settings.findOne({ restaurantId });
    const tva = settings?.tva || 0;
    const totalHt = (100 * history.total) / (100 + tva);
    // const tvaAmount = history.total - totalHt;
    const orderDate = new Date(history.boughtAt).setHours(0, 0, 0, 0);
    const today = new Date().setHours(0, 0, 0, 0);
    let totalHT = 0;
    let totalTVA = 0;
    history.product.forEach((product) => {
      const productTotal = Number(product.total) || 0;
      const productTva = product.tva && product.tva > 0 ? product.tva : tva;

      const productHT = (100 * productTotal) / (100 + productTva);
      const productTVA = productTotal - productHT;

      totalHT += productHT;
      totalTVA += productTVA;
    });
    if (orderDate < today) {
      return res.status(400).json({
        message: req.t("history.email_past_order_error"),
      });
    }
    const logoUrl = `${process.env.BASE_URL}/api/${restaurant.logo.replace(
      /\\/g,
      "/"
    )}`;
    const pdfPath = await generatePDF(history);
    const transporter = await createTransporter(restaurantId);
    const mailOptions = {
      from: `${settings.emailName} <${settings.emailSender}>`,
      to: email,
      subject: "Ticket de commande",
      text: "",
      template: "/template/index",
      attachments: [
        {
          filename: `order-${history.commandNumber}.pdf`,
          path: pdfPath,
        },
      ],
      context: {
        apiUrl: process.env.BASE_URL,
        commandNumber: commandNumber,
        logo: logoUrl,
        isEmail: true,
        name: history.name,
        boughtAt: formattedDate,
        products: history.product.map((product) => {
          return {
            platName: product.plat.name,
            price: product.plat.price.toFixed(2),
            currency: history.currency,
            count: product.plat.count,
            variation: product.variation
              ? {
                  ...product.variation,
                  price: Number(product.variation.price).toFixed(2),
                }
              : null,
            addons: product.addons.map((addon) => {
              return {
                name: addon.name,
                count: addon.count,
                price: addon.price.toFixed(2),
                currency: history.currency,
              };
            }),
            extras: product.extras.map((extra) => {
              return {
                name: extra.name,
                count: extra.count,
                price: extra.price.toFixed(2),
                currency: history.currency,
              };
            }),
          };
        }),
        total: history.total.toFixed(2),
        totalHt: totalHT.toFixed(2),
        tvaAmount: totalTVA.toFixed(2),
        tva: tva,
        pack: history.pack.label,
        method: history.method.label,
        currency: history.currency,
        restaurantId: restaurantId,
      },
    };
    await transporter.sendMail(mailOptions);
    fs.unlinkSync(pdfPath);
    res.status(200).json({ message: req.t("history.email_sent_success") });
  } catch (error) {
    console.error(req.t("history.save_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

exports.getCommandNumber = async (req, res) => {
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const { restaurantId } = req;

  try {
    const lastCommand = await History.findOne({ restaurantId }).sort({
      boughtAt: -1,
    });

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0); // Start of today

    if (lastCommand) {
      const lastCommandDate = new Date(lastCommand.boughtAt);
      lastCommandDate.setHours(0, 0, 0, 0); // Start of last command day

      // Compare dates
      if (currentDate.getTime() > lastCommandDate.getTime()) {
        // New day - reset to 1
        return res.status(200).json(1);
      } else {
        // Same day - increment
        return res.status(200).json(lastCommand.commandNumber + 1);
      }
    }

    // No previous commands
    return res.status(200).json(1);
  } catch (error) {
    console.error(req.t("history.command_number_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const { restaurantId } = req;
  const { fullName } = req.user.user;
  try {
    const history = await History.findOneAndUpdate(
      { _id: id, restaurantId },
      { status },
      { new: true }
    );
    if (!history) {
      return res
        .status(404)
        .json({ message: req.t("history.history_not_found") });
    }
    const statusHistory = new StatusHistory({
      historyId: id,
      status,
      updatedBy: fullName,
      updatedAt: new Date(),
      restaurantId,
    });

    await statusHistory.save();
    io.emit("status-update", {
      id,
      status,
      updatedBy: fullName,
      updatedAt: new Date(),
    });
    res.status(200).json(history);
  } catch (error) {
    console.error(req.t("history.status_update_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

exports.getHistoriesRT = async (socket) => {
  try {
    socket.on("fetch-histories", async (data) => {
      try {
        const {
          page = 1,
          search = "",
          startDate,
          endDate,
          filter = "",
          status = "all",
        } = data;
        const limit = 30;
        const skip = (page - 1) * limit;
        const { restaurantId } = data;

        let matchQuery = {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
        };

        if (status && status !== "all") {
          matchQuery.status = status;
        }
        const currentDate = new Date();
        if (filter === "today") {
          const startOfDay = new Date(currentDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(currentDate);
          endOfDay.setHours(23, 59, 59, 999);

          matchQuery.boughtAt = { $gte: startOfDay, $lte: endOfDay };
        } else if (filter === "week") {
          const startOfWeek = new Date(currentDate);
          startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
          startOfWeek.setHours(0, 0, 0, 0);

          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);

          matchQuery.boughtAt = { $gte: startOfWeek, $lte: endOfWeek };
        } else if (filter === "month") {
          const startOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            1
          );
          const endOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0
          );
          endOfMonth.setHours(23, 59, 59, 999);

          matchQuery.boughtAt = { $gte: startOfMonth, $lte: endOfMonth };
        } else {
          if (
            (startDate && startDate.trim() !== "") ||
            (endDate && endDate.trim() !== "")
          ) {
            matchQuery.$expr = { $and: [] };

            if (startDate && startDate.trim() !== "") {
              const start = new Date(startDate);
              start.setHours(0, 0, 0, 0);
              matchQuery.boughtAt = {
                ...matchQuery.boughtAt,
                $gte: start,
              };
            }

            if (endDate && endDate.trim() !== "") {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              matchQuery.boughtAt = {
                ...matchQuery.boughtAt,
                $lte: end,
              };
            }
          }
        }
        if (search && search.trim() !== "") {
          const searchRegex = new RegExp(search, "i");
          matchQuery.$or = [
            { name: { $regex: searchRegex } },
            { commandNumber: isNaN(parseInt(search)) ? -1 : parseInt(search) },
          ];
        }

        const aggregationPipeline = [
          { $match: matchQuery },
          {
            $lookup: {
              from: "settings",
              pipeline: [{ $limit: 1 }],
              as: "settingsData",
            },
          },
          {
            $unwind: {
              path: "$settingsData",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $facet: {
              histories: [
                {
                  $addFields: {
                    totalHT: {
                      $round: [
                        {
                          $sum: {
                            $map: {
                              input: "$product",
                              as: "p",
                              in: {
                                $divide: [
                                  { $multiply: ["$$p.total", 100] },
                                  {
                                    $add: [
                                      { $ifNull: ["$$p.tva", "$tva"] },
                                      100,
                                    ],
                                  },
                                ],
                              },
                            },
                          },
                        },
                        2,
                      ],
                    },
                  },
                },
                {
                  $addFields: {
                    tvaAmount: {
                      $round: [{ $subtract: ["$total", "$totalHT"] }, 2],
                    },
                  },
                },
                {
                  $unwind: "$product",
                },
                {
                  $addFields: {
                    "product.plat._id": {
                      $toObjectId: "$product.plat._id",
                    },
                  },
                },
                {
                  $lookup: {
                    from: "products",
                    localField: "product.plat._id",
                    foreignField: "_id",
                    as: "productDetails",
                  },
                },
                {
                  $unwind: {
                    path: "$productDetails",
                    preserveNullAndEmptyArrays: true,
                  },
                },

                {
                  $lookup: {
                    from: "categories",
                    let: { categoryId: "$productDetails.category" },
                    pipeline: [
                      {
                        $match: {
                          $expr: { $eq: ["$_id", "$$categoryId"] },
                        },
                      },
                    ],
                    as: "categoryDetails",
                  },
                },
                {
                  $unwind: {
                    path: "$categoryDetails",
                    preserveNullAndEmptyArrays: true,
                  },
                },
                {
                  $lookup: {
                    from: "coupons",
                    let: { couponId: "$couponId" },
                    pipeline: [
                      { $match: { $expr: { $eq: ["$_id", "$$couponId"] } } },
                      { $project: { _id: 1, code: 1, couponType: 1 } },
                    ],
                    as: "couponDetails",
                  },
                },
                {
                  $unwind: {
                    path: "$couponDetails",
                    preserveNullAndEmptyArrays: true,
                  },
                },
                {
                  $group: {
                    _id: "$_id",
                    product: { $push: "$product" },
                    name: { $first: "$name" },
                    method: { $first: "$method.label" },
                    pack: { $first: "$pack.label" },
                    total: { $first: "$total" },
                    totalHT: { $first: "$totalHT" },
                    tvaAmount: { $first: "$tvaAmount" },
                    discountValue: { $first: "$discountValue" },
                    tva: { $first: "$tva" },
                    // tvaRate: { $first: "$tvaRate" },
                    boughtAt: { $first: "$boughtAt" },
                    currency: { $first: "$settingsData.defaultCurrency" },
                    commandNumber: { $first: "$commandNumber" },
                    status: { $first: "$status" },
                    coupon: { $first: "$couponDetails" },
                  },
                },
                { $sort: { boughtAt: -1 } },
                { $skip: skip },
                { $limit: limit },
              ],
            },
          },
        ];

        const statsQuery = { ...matchQuery };
        delete statsQuery.status;
        const result = await History.aggregate(aggregationPipeline);
        const [{ histories }] = result;
        const counts = await History.aggregate([
          { $match: statsQuery },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              enCours: {
                $sum: { $cond: [{ $eq: ["$status", "enCours"] }, 1, 0] },
              },
              terminee: {
                $sum: { $cond: [{ $eq: ["$status", "terminee"] }, 1, 0] },
              },
              annulee: {
                $sum: { $cond: [{ $eq: ["$status", "annulee"] }, 1, 0] },
              },
              echouee: {
                $sum: { $cond: [{ $eq: ["$status", "echouee"] }, 1, 0] },
              },
              enAttente: {
                $sum: { $cond: [{ $eq: ["$status", "enAttente"] }, 1, 0] },
              },
              enRetard: {
                $sum: { $cond: [{ $eq: ["$status", "enRetard"] }, 1, 0] },
              },
              remboursee: {
                $sum: { $cond: [{ $eq: ["$status", "remboursee"] }, 1, 0] },
              },
            },
          },
        ]);

        const stats = counts[0] || {};
        const total = await History.countDocuments(matchQuery);
        const restaurantTimezone =
          process.env.RESTAURANT_TIMEZONE || "Europe/Paris";
        const formattedHistories = histories.map((history) => {
          // Format boughtAt date using moment-timezone
          const formattedBoughtAt = history.boughtAt
            ? moment(history.boughtAt)
                .tz(restaurantTimezone)
                .format("YYYY-MM-DD HH:mm:ss")
            : null;

          return {
            ...history,
            boughtAt: formattedBoughtAt,
          };
        });
        const response = {
          histories: formattedHistories,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
          },
          stats: {
            total: counts[0]?.total || 0,
            enCours: counts[0]?.enCours || 0,
            terminee: counts[0]?.terminee || 0,
            annulee: counts[0]?.annulee || 0,
            echouee: counts[0]?.echouee || 0,
            enAttente: counts[0]?.enAttente || 0,
            remboursee: counts[0]?.remboursee || 0,
            enRetard: counts[0]?.enRetard || 0,
          },
        };

        io.to(`restaurant-${restaurantId}`).emit("histories-update", response);
      } catch (error) {
        console.error("Error in fetch-histories:", error);
        socket.emit(
          "error",
          socket.request.t("history.fetch_histories_error", {
            error: error.message,
          })
        );
      }
    });
  } catch (error) {
    io.to(`restaurant`).emit("error", {
      message: "Failed to fetch histories",
      error: error.message,
    });
  }
};
const checkAndUpdateDelayedOrders = async (restaurantId) => {
  try {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

    const delayedOrders = await History.find({
      status: "enCours",
      restaurantId,
      boughtAt: { $lt: twentyMinutesAgo },
    });

    for (const order of delayedOrders) {
      await History.findOneAndUpdate(
        { _id: order._id, restaurantId },
        { status: "enRetard" },
        { new: true }
      );
      const statusHistory = new StatusHistory({
        historyId: order._id,
        status: "enRetard",
        updatedBy: "Système",
        updatedAt: new Date(),
      });

      await statusHistory.save();

      if (io) {
        io.emit("status-update", {
          id: order._id,
          status: "enRetard",
          updatedAt: new Date(),
        });
      }
    }
  } catch (error) {
    console.error("Error checking delayed orders:", error);
  }
};

exports.getStatistics = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { filter = "today", startDate, endDate } = req.query;
    const currentDate = new Date();
    let matchQuery = {
      restaurantId: new mongoose.Types.ObjectId(restaurantId),
    };
    let revenueMatchQuery = {}; // For revenue calculations (date + status)
    let previousPeriodMatchQuery = {}; // For date filtering only
    let previousPeriodRevenueMatchQuery = {}; // For revenue calculations (date + status)
    const settings = await Settings.findOne({ restaurantId });
    const cbMethodId = settings.method[0]._id.toString();
    const especeMethodId = settings.method[0]._id.toString();
    const surPlacePackId = settings.pack[0]._id.toString();
    const emporterPackId = settings.pack[1]._id.toString();

    if (
      (startDate && startDate.trim() !== "") ||
      (endDate && endDate.trim() !== "")
    ) {
      matchQuery.boughtAt = {};

      if (startDate && startDate.trim() !== "") {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        matchQuery.boughtAt = {
          ...matchQuery.boughtAt,
          $gte: start,
        };
      }

      if (endDate && endDate.trim() !== "") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.boughtAt = {
          ...matchQuery.boughtAt,
          $lte: end,
        };
      }
    } else if (filter === "today") {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      const startOfYesterday = new Date(startOfDay);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const endOfYesterday = new Date(endOfDay);
      endOfYesterday.setDate(endOfYesterday.getDate() - 1);

      matchQuery.boughtAt = { $gte: startOfDay, $lte: endOfDay };
      previousPeriodMatchQuery.boughtAt = {
        $gte: startOfYesterday,
        $lte: endOfYesterday,
      };
    } else if (filter === "week") {
      const day = currentDate.getDay() || 7;
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - day + 1);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      const startOfPreviousWeek = new Date(startOfWeek);
      startOfPreviousWeek.setDate(startOfPreviousWeek.getDate() - 7);
      const endOfPreviousWeek = new Date(endOfWeek);
      endOfPreviousWeek.setDate(endOfPreviousWeek.getDate() - 7);

      matchQuery.boughtAt = { $gte: startOfWeek, $lte: endOfWeek };
      previousPeriodMatchQuery.boughtAt = {
        $gte: startOfPreviousWeek,
        $lte: endOfPreviousWeek,
      };
    } else if (filter === "month") {
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      );
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      );
      endOfMonth.setHours(23, 59, 59, 999);
      const startOfPreviousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1
      );
      const endOfPreviousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        0
      );
      endOfPreviousMonth.setHours(23, 59, 59, 999);

      matchQuery.boughtAt = { $gte: startOfMonth, $lte: endOfMonth };
      previousPeriodMatchQuery.boughtAt = {
        $gte: startOfPreviousMonth,
        $lte: endOfPreviousMonth,
      };
    }

    revenueMatchQuery = {
      ...matchQuery,
      status: { $in: ["terminee", "enCours", "enRetard", "enAttente"] },
    };
    previousPeriodRevenueMatchQuery = {
      ...previousPeriodMatchQuery,
      status: { $in: ["terminee", "enCours", "enRetard", "enAttente"] },
    };

    const statusCounts = await History.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          orderStatuses: { $push: "$status" },
        },
      },
      {
        $addFields: {
          statusCounts: {
            $reduce: {
              input: "$orderStatuses",
              initialValue: {
                enCours: 0,
                terminee: 0,
                annulee: 0,
                enRetard: 0,
                enAttente: 0,
                echouee: 0,
                remboursee: 0,
              },
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$$this", "enCours"] },
                          then: { enCours: { $add: ["$$value.enCours", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "terminee"] },
                          then: { terminee: { $add: ["$$value.terminee", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "annulee"] },
                          then: { annulee: { $add: ["$$value.annulee", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "enRetard"] },
                          then: { enRetard: { $add: ["$$value.enRetard", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "echouee"] },
                          then: { echouee: { $add: ["$$value.echouee", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "enAttente"] },
                          then: {
                            enAttente: { $add: ["$$value.enAttente", 1] },
                          },
                        },
                        {
                          case: { $eq: ["$$this", "remboursee"] },
                          then: {
                            remboursee: { $add: ["$$value.remboursee", 1] },
                          },
                        },
                      ],
                      default: "$$value",
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          orderStatuses: "$statusCounts",
        },
      },
    ]);

    const currentPeriodStats = await History.aggregate([
      { $match: revenueMatchQuery }, // Only completed orders for revenue
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          completedOrders: { $sum: 1 }, // Count of completed orders
          especeTotal: {
            $sum: {
              $cond: [
                { $eq: [{ $toString: "$method._id" }, especeMethodId] },
                "$total",
                0,
              ],
            },
          },
          cbTotal: {
            $sum: {
              $cond: [
                { $eq: [{ $toString: "$method._id" }, cbMethodId] },
                "$total",
                0,
              ],
            },
          },
          surPlaceCount: {
            $sum: {
              $cond: [
                { $eq: [{ $toString: "$pack._id" }, surPlacePackId] },
                1,
                0,
              ],
            },
          },
          emporterCount: {
            $sum: {
              $cond: [
                { $eq: [{ $toString: "$pack._id" }, emporterPackId] },
                1,
                0,
              ],
            },
          },
          surPlaceTotal: {
            $sum: {
              $cond: [
                { $eq: [{ $toString: "$pack._id" }, surPlacePackId] },
                "$total",
                0,
              ],
            },
          },
          emporterTotal: {
            $sum: {
              $cond: [
                { $eq: [{ $toString: "$pack._id" }, emporterPackId] },
                "$total",
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: { $round: ["$totalRevenue", 2] },
          completedOrders: 1,
          moyenRevenue: {
            $round: [{ $divide: ["$totalRevenue", "$completedOrders"] }, 2],
          },
          paymentMethodsTotalRevenue: {
            espece: { $round: ["$especeTotal", 2] },
            cb: { $round: ["$cbTotal", 2] },
          },
          deliveryTypes: {
            surPlaceCount: "$surPlaceCount",
            emporterCount: "$emporterCount",
            surPlace: { $round: ["$surPlaceTotal", 2] },
            emporter: { $round: ["$emporterTotal", 2] },
          },
        },
      },
    ]);
    const topProductsStats = await History.aggregate([
      { $match: revenueMatchQuery },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "products",
          let: { productId: { $toObjectId: "$product.plat._id" } },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$productId"] } } },
            { $project: { image: 1, name: 1, imagePreviewHash: 1 } },
          ],
          as: "productDetails",
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: {
            id: "$product.plat._id",
            name: "$product.plat.name",
            image: "$productDetails.image",
            imagePreviewHash: "$productDetails.imagePreviewHash",
          },
          totalCount: { $sum: "$product.plat.count" },
          totalRevenue: {
            $sum: { $multiply: ["$product.plat.price", "$product.plat.count"] },
          },
        },
      },
      { $sort: { totalCount: -1 } },
      { $limit: 7 },
      {
        $project: {
          _id: "$_id.id",
          name: "$_id.name",
          image: "$_id.image",
          imagePreviewHash: "$_id.imagePreviewHash",
          totalCount: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] },
        },
      },
    ]);

    const totalPlatStats = await History.aggregate([
      { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId) } },
      { $unwind: "$product" },
      {
        $group: {
          _id: null,
          totalPlat: { $sum: "$product.plat.count" }, // Sum all product quantities
        },
      },
    ]);

    const previousPeriodStats = await History.aggregate([
      { $match: previousPeriodRevenueMatchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
        },
      },
    ]);

    const currentRevenue = currentPeriodStats[0]?.totalRevenue || 0;
    const previousRevenue = previousPeriodStats[0]?.totalRevenue || 0;
    const totalRevenueSum = currentRevenue + previousRevenue;
    let currentRevenuePercentage = 0;

    if (totalRevenueSum > 0) {
      currentRevenuePercentage = (currentRevenue / totalRevenueSum) * 100;
    }
    const roundedCurrentRevenuePercentage = Math.floor(
      currentRevenuePercentage
    );

    let revenueDifference = currentRevenue - previousRevenue;
    if (currentRevenue < previousRevenue) {
      revenueDifference = revenueDifference * -1;
    }

    let revenueChange = 0;
    if (previousRevenue > 0) {
      revenueChange =
        ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    } else if (currentRevenue > 0) {
      revenueChange = 100;
    }

    if (revenueChange < 0) {
      revenueChange = revenueChange * -1;
    }

    let timeRangeLabel = filter;
    if (startDate || endDate) {
      timeRangeLabel = "custom";
      if (startDate && endDate) {
        timeRangeLabel = `${startDate} to ${endDate}`;
      } else if (startDate) {
        timeRangeLabel = `From ${startDate}`;
      } else if (endDate) {
        timeRangeLabel = `Until ${endDate}`;
      }
    }

    res.status(200).json({
      ...(currentPeriodStats[0] || {
        moyenRevenue: 0,
        totalRevenue: 0,
        paymentMethodsTotalRevenue: { espece: 0, cb: 0 },
        deliveryTypes: {
          surPlace: 0,
          emporter: 0,
          surPlaceCount: 0,
          emporterCount: 0,
        },
      }),
      totalOrders: statusCounts[0]?.totalOrders || 0,
      totalPlat: totalPlatStats[0]?.totalPlat || 0,
      orderStatuses: statusCounts[0]?.orderStatuses || {
        enCours: 0,
        terminee: 0,
        annulee: 0,
        enRetard: 0,
        enAttente: 0,
        echouee: 0,
        remboursee: 0,
      },
      revenueComparison: {
        currentRevenue: currentRevenue,
        previousRevenue: previousRevenue,
        difference: Math.round(revenueDifference * 100) / 100,
        percentageChange: Math.round(revenueChange * 100) / 100,
        currentRevenuePercentage: roundedCurrentRevenuePercentage,
        trend:
          currentRevenue > previousRevenue
            ? "increase"
            : currentRevenue < previousRevenue
            ? "decrease"
            : "stable",
      },
      topProducts: topProductsStats,
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({
      success: false,
      message: req.t("history.statistics_error"),
      error: error.message,
    });
  }
};
exports.getLatestPrintJob = async (req, res) => {
  try {
    const { restaurantId } = req;
    // Ici, on considère qu'une commande prête à être imprimée est en status "enCours"
    // Vous pouvez ajuster la condition selon votre logique (ex: "pending")
    const printJob = await History.findOne({
      status: "enCours",
      restaurantId,
    }).sort({
      boughtAt: 1,
    });

    if (!printJob) {
      return res.status(204).send(req.t("history.no_pending_print_job"));
    }

    // Marquer la commande comme "enAttente" (inProgress) pour éviter de l'imprimer à nouveau
    printJob.status = "enAttente";
    await printJob.save();

    res.status(200).json(printJob);
  } catch (error) {
    console.error(req.t("history.latest_print_job_error_log"), error);
    res.status(500).json({ message: req.t("history.internal_server_error") });
  }
};

// 🖨️ Manual print endpoint for cashiers
exports.manualPrint = async (req, res) => {
  const { id } = req.params;
  const { restaurantId } = req;

  try {
    const order = await History.findOne({ _id: id, restaurantId });

    if (!order) {
      return res
        .status(404)
        .json({ message: req.t("history.order_not_found") });
    }

    // Immediate response to cashier
    res.status(200).json({
      success: true,
      message: req.t("history.manual_print_request_sent"),
      orderId: id,
      commandNumber: order.commandNumber,
    });

    // Trigger print (non-blocking)
    setImmediate(() => triggerAutoPrint(id));
  } catch (error) {
    console.error(req.t("history.manual_print_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 📊 Get failed prints for admin dashboard
exports.getFailedPrints = async (req, res) => {
  const { restaurantId } = req;

  try {
    // Get orders with failed print status
    const failedOrders = await History.find({
      restaurantId,
      printStatus: { $in: ["failed", "retry_exhausted"] },
    })
      .sort({ lastPrintAttempt: -1 })
      .limit(20);

    // Get in-memory queue status
    const queuedJobs = failedPrintQueue
      .filter((job) => job.restaurantId.toString() === restaurantId)
      .map((job) => ({
        orderId: job.orderId,
        commandNumber: job.commandNumber,
        attempts: job.attempts,
        nextRetry: job.nextRetry,
        error: job.error,
        createdAt: job.createdAt,
      }));

    res.status(200).json({
      failedOrders: failedOrders.map((order) => ({
        _id: order._id,
        commandNumber: order.commandNumber,
        name: order.name,
        total: order.total,
        boughtAt: order.boughtAt,
        printStatus: order.printStatus,
        printError: order.printError,
        lastPrintAttempt: order.lastPrintAttempt,
      })),
      queuedRetries: queuedJobs,
      totalFailed: failedOrders.length,
      totalQueued: queuedJobs.length,
      message: req.t("history.failed_prints_success"),
    });
  } catch (error) {
    console.error(req.t("history.failed_prints_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 🔄 Retry specific print job
exports.retryPrint = async (req, res) => {
  const { id } = req.params;
  const { restaurantId } = req;

  try {
    const order = await History.findOne({ _id: id, restaurantId });

    if (!order) {
      return res
        .status(404)
        .json({ message: req.t("history.order_not_found") });
    }

    // Reset print status
    await History.findByIdAndUpdate(id, {
      printStatus: "pending",
      printError: null,
      lastPrintAttempt: new Date(),
    });

    // Remove from failed queue if exists
    const jobIndex = failedPrintQueue.findIndex(
      (job) => job.orderId.toString() === id
    );
    if (jobIndex > -1) {
      failedPrintQueue.splice(jobIndex, 1);
    }

    // Immediate response
    res.status(200).json({
      success: true,
      message: req.t("history.print_retried"),
      orderId: id,
      commandNumber: order.commandNumber,
    });

    // Trigger print
    setImmediate(() => triggerAutoPrint(id));
  } catch (error) {
    console.error(req.t("history.retry_print_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 🔄 Retry all failed prints
exports.retryAllFailedPrints = async (req, res) => {
  const { restaurantId } = req;

  try {
    const failedOrders = await History.find({
      restaurantId,
      printStatus: { $in: ["failed", "retry_exhausted"] },
    });

    // Reset all failed orders
    await History.updateMany(
      {
        restaurantId,
        printStatus: { $in: ["failed", "retry_exhausted"] },
      },
      {
        printStatus: "pending",
        printError: null,
        lastPrintAttempt: new Date(),
      }
    );

    // Clear failed queue for this restaurant
    failedPrintQueue = failedPrintQueue.filter(
      (job) => job.restaurantId.toString() !== restaurantId
    );

    // Immediate response
    res.status(200).json({
      success: true,
      message: req.t("history.all_prints_retried", {
        count: failedOrders.length,
      }),
      retriedCount: failedOrders.length,
    });

    // Trigger prints for all failed orders
    failedOrders.forEach((order) => {
      setImmediate(() => triggerAutoPrint(order._id));
    });
  } catch (error) {
    console.error(req.t("history.retry_all_failed_prints_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 📈 Get print statistics
exports.getPrintStats = async (req, res) => {
  const { restaurantId } = req;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await History.aggregate([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          boughtAt: { $gte: today },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          printedSuccessfully: {
            $sum: { $cond: [{ $eq: ["$printStatus", "printed"] }, 1, 0] },
          },
          printFailed: {
            $sum: { $cond: [{ $eq: ["$printStatus", "failed"] }, 1, 0] },
          },
          printRetryExhausted: {
            $sum: {
              $cond: [{ $eq: ["$printStatus", "retry_exhausted"] }, 1, 0],
            },
          },
          printPending: {
            $sum: { $cond: [{ $eq: ["$printStatus", "pending"] }, 1, 0] },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalOrders: 0,
      printedSuccessfully: 0,
      printFailed: 0,
      printRetryExhausted: 0,
      printPending: 0,
    };

    // Calculate success rate
    const successRate =
      result.totalOrders > 0
        ? Math.round((result.printedSuccessfully / result.totalOrders) * 100)
        : 0;

    res.status(200).json({
      ...result,
      successRate,
      activeRetries: failedPrintQueue.filter(
        (job) => job.order.restaurantId.toString() === restaurantId
      ).length,
      message: req.t("history.print_stats_success"),
    });
  } catch (error) {
    console.error(req.t("history.print_stats_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};
