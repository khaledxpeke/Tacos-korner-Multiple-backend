const History = require("../models/History");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const transporter = require("../middleware/email");
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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

exports.setIO = (socketIO) => {
  console.log("Socket IO initializée avec id:", socketIO.id);
  io = socketIO;
};
exports.addHistory = async (req, res) => {
  const { products, pack, name, method, total, currency, commandNumber } =
    req.body;
  const { restaurantId } = req;
  try {
    const settings = await Settings.findOne({ restaurantId });
    const parisTime = moment.tz("Europe/Paris");
    const franceDatetime = parisTime.toDate();
    const methodExists = settings.method.find(
      (m) => m._id.toString() === method
    );
    const packExists = settings.pack.find((p) => p._id.toString() === pack);
    if (!packExists || !packExists.isActive) {
      return res.status(404).json({ message: "Mode de livraison non trouvé" });
    }
    if (!methodExists || !methodExists.isActive) {
      return res.status(404).json({ message: "Mode de paiement non trouvé" });
    }
    const tva = settings?.tva || 0;
    const history = await new History({
      product: products.map((product) => {
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
        };
      }),
      name,
      currency,
      tva,
      status: "enCours",
      logo: settings.logo,
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
          io.emit("new-history", response);
          await notifyWaiters(history);
        } else {
          console.log("Socket n'est pas initializer, aucun emit performé");
        }
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
        setInterval(() => checkAndUpdateDelayedOrders(restaurantId), 20 * 60 * 1000);
        res.status(201).json(response);
      })
      .catch((err) => {
        console.log(
          "Une erreur s'est produite lors de l'enregistrement de l'historique:",
          err
        );
        res.status(500).json({
          message: "Une erreur s'est produite",
          error: err,
        });
      });
  } catch (error) {
    console.error("Error saving history:", error);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

const notifyWaiters = async (history) => {
  try {
    const { restaurantId } = history;
    const users = await User.find({
      fcmToken: { $ne: "" },
      restaurants: { $elemMatch: { restaurantId } },
    });

    const tokens = users.map((user) => user.fcmToken);

    const payload = {
      notification: {
        title: "Nouvelle commande",
        body: `${history.name} à commander une nouvelle commande N°${history.commandNumber}`,
      },
    };

    for (const token of tokens) {
      try {
        await admin.messaging().send({
          ...payload,
          token,
        });
      } catch (error) {
        console.error(
          `Erreur d'envoyer les notifications au jetons: ${token}`,
          error
        );
      }
    }
  } catch (error) {
    console.error("Erreur d'envoyer les notifications:", error);
  }
};
exports.getHistory = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (page - 1) * parseInt(limit);
    let query = { restaurantId };

    // Add search filter if provided
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { name: { $regex: searchRegex } },
        { commandNumber: isNaN(parseInt(search)) ? -1 : parseInt(search) },
        { "method.label": { $regex: searchRegex } },
        { "pack.label": { $regex: searchRegex } },
      ];
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
      .lean();
    const historiesWithTva = histories.map((history) => {
      const tva = history.tva || 0;
      const totalHT = (100 * history.total) / (100 + tva);
      const tvaAmount = history.total - totalHT;
      const formattedBoughtAt = history.boughtAt
        ? moment(history.boughtAt).format("YYYY-MM-DD HH:mm:ss")
        : null;

      return {
        ...history,
        tvaAmount: parseFloat(tvaAmount.toFixed(2)),
        totalHT: parseFloat(totalHT.toFixed(2)),
        boughtAt: formattedBoughtAt,
      };
    });

    const totalHistories = await History.countDocuments({ restaurantId });

    res.status(200).json({
      histories: historiesWithTva,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalHistories / limit),
        totalRecords: totalHistories,
      },
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({
      message:
        "Une erreur s'est produite lors de la récupération de l'historique",
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
    res.status(500).json({ message: error.message });
    throw error;
  }
};

const generatePDF = async (orderData) => {
  const { restaurantId } = orderData;

  if (!restaurantId) {
    throw new Error("ID Restaurant n'est pas trouvée dans l'historique.");
  }
  const html = fs.readFileSync(
    path.join(__dirname, "../template/pdf.handlebars"),
    "utf8"
  );
  const settings = await Settings.findOne({ restaurantId });
  const tva = settings?.tva || 0;
  const address = settings?.address;
  const totalHt = (100 * orderData.total) / (100 + tva);
  const tvaAmount = orderData.total - totalHt;
  const logoUrl = `${process.env.BASE_URL}/${settings.logo.replace(
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
      tvaAmount: tvaAmount.toFixed(2),
      tva: tva,
      totalHt: totalHt.toFixed(2),
      logo: logoUrl,
      address: address.split("\n"),
      pack: orderData.pack.label,
      method: orderData.method.label,
      currency: orderData.currency,
      restaurantId: restaurantId,
    },
    path: `./uploads/order-${orderData.commandNumber}.pdf`,
  };

  try {
    await pdf.create(document, options);
    return document.path;
  } catch (error) {
    console.error("Erreur de génération de PDF:", error);
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
      return res.status(404).json({ message: "Ordre non trouvée" });
    }
    let formattedDate = moment(history.boughtAt)
      .tz(process.env.RESTAURANT_TIMEZONE || "Europe/Paris")
      .format("D MMMM YYYY HH:mm");
    const settings = await Settings.findOne({ restaurantId });
    const tva = settings?.tva || 0;
    const totalHt = (100 * history.total) / (100 + tva);
    const tvaAmount = history.total - totalHt;
    const orderDate = new Date(history.boughtAt).setHours(0, 0, 0, 0);
    const today = new Date().setHours(0, 0, 0, 0);
    if (orderDate < today) {
      return res.status(400).json({
        message:
          "Impossible d'envoyer un e-mail pour les commandes des jours précédents",
      });
    }
    const logoUrl = `${process.env.BASE_URL}/api/${settings.logo.replace(
      /\\/g,
      "/"
    )}`;
    const pdfPath = await generatePDF(history);
    const mailOptions = {
      from: `${process.env.EMAIL_NAME} <${process.env.EMAIL_SENDER}>`,
      // from: "khaledbouajila5481@gmail.com",
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
        tvaAmount: tvaAmount.toFixed(2),
        totalHt: totalHt.toFixed(2),
        tva: tva,
        pack: history.pack.label,
        method: history.method.label,
        currency: history.currency,
        restaurantId: restaurantId,
      },
    };
    await transporter.sendMail(mailOptions);
    fs.unlinkSync(pdfPath);
    res.status(200).json({ message: "E-mail envoyé avec succès" });
  } catch (error) {
    console.error("Error saving history:", error);
    res.status(500).json({ error: "Erreur interne du serveur" });
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
    console.error("Error getting command number:", error);
    res.status(500).json({ error: "Erreur interne du serveur" });
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
      return res.status(404).json({ message: "Historique non trouvé" });
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
    console.error(
      "Erreur lors de la mise à jour du statut de l'historique:",
      error
    );
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

exports.getHistoriesRT = async (socket) => {
  try {
    socket.on("fetch-histories", async (data) => {
      try {
        const { page = 1, search = "", dateDebut, dateFin, filter = "" } = data;
        const limit = 30;
        const skip = (page - 1) * limit;
        const { restaurantId } = data;

        let matchQuery = {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
        };

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
            (dateDebut && dateDebut.trim() !== "") ||
            (dateFin && dateFin.trim() !== "")
          ) {
            matchQuery.$expr = { $and: [] };

            if (dateDebut && dateDebut.trim() !== "") {
              const startDate = new Date(dateDebut);
              startDate.setHours(0, 0, 0, 0);
              matchQuery.boughtAt = {
                ...matchQuery.boughtAt,
                $gte: startDate,
              };
            }

            if (dateFin && dateFin.trim() !== "") {
              const endDate = new Date(dateFin);
              endDate.setHours(23, 59, 59, 999);
              matchQuery.boughtAt = {
                ...matchQuery.boughtAt,
                $lte: endDate,
              };
            }
          }
        }
        if (search && search.trim() !== "") {
          const searchRegex = new RegExp(search, "i");
          matchQuery.$or = [
            { name: { $regex: searchRegex } },
            { commandNumber: isNaN(parseInt(search)) ? -1 : parseInt(search) },
            { "method.label": { $regex: searchRegex } },
            { "pack.label": { $regex: searchRegex } },
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
                    tvaRate: { $ifNull: ["$tva", 0] },
                    totalHT: {
                      $round: [
                        {
                          $divide: [
                            { $multiply: ["$total", 100] },
                            { $add: [{ $ifNull: ["$tva", 0] }, 100] },
                          ],
                        },
                        2,
                      ],
                    },
                    tvaAmount: {
                      $round: [
                        {
                          $subtract: [
                            "$total",
                            {
                              $divide: [
                                { $multiply: ["$total", 100] },
                                { $add: [{ $ifNull: ["$tva", 0] }, 100] },
                              ],
                            },
                          ],
                        },
                        2,
                      ],
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
                  $group: {
                    _id: "$_id",
                    product: { $push: "$product" },
                    name: { $first: "$name" },
                    method: { $first: "$method.label" },
                    pack: { $first: "$pack.label" },
                    total: { $first: "$total" },
                    totalHT: { $first: "$totalHT" },
                    tvaAmount: { $first: "$tvaAmount" },
                    tva: { $first: "$tva" },
                    // tvaRate: { $first: "$tvaRate" },
                    boughtAt: { $first: "$boughtAt" },
                    currency: { $first: "$settingsData.defaultCurrency" },
                    commandNumber: { $first: "$commandNumber" },
                    status: { $first: "$status" },
                  },
                },
                { $sort: { boughtAt: -1 } },
                { $skip: skip },
                { $limit: limit },
              ],
              counts: [
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
                      $sum: {
                        $cond: [{ $eq: ["$status", "enAttente"] }, 1, 0],
                      },
                    },
                    enRetard: {
                      $sum: { $cond: [{ $eq: ["$status", "enRetard"] }, 1, 0] },
                    },
                    remboursee: {
                      $sum: {
                        $cond: [{ $eq: ["$status", "remboursee"] }, 1, 0],
                      },
                    },
                  },
                },
              ],
            },
          },
        ];

        const result = await History.aggregate(aggregationPipeline);
        const [{ histories, counts }] = result;
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

        socket.emit("histories-update", response);
      } catch (error) {
        console.error("Error in fetch-histories:", error);
        socket.emit("error", error.message);
      }
    });
  } catch (error) {
    socket.emit("error", error.message);
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
    const { filter = "today", dateDebut, dateFin } = req.query;
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
      (dateDebut && dateDebut.trim() !== "") ||
      (dateFin && dateFin.trim() !== "")
    ) {
      matchQuery.boughtAt = {};

      if (dateDebut && dateDebut.trim() !== "") {
        const startDate = new Date(dateDebut);
        startDate.setHours(0, 0, 0, 0);
        matchQuery.boughtAt = {
          ...matchQuery.boughtAt,
          $gte: startDate,
        };
      }

      if (dateFin && dateFin.trim() !== "") {
        const endDate = new Date(dateFin);
        endDate.setHours(23, 59, 59, 999);
        matchQuery.boughtAt = {
          ...matchQuery.boughtAt,
          $lte: endDate,
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
            { $project: { image: 1, name: 1 } },
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
          totalCount: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] },
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
    if (dateDebut || dateFin) {
      timeRangeLabel = "custom";
      if (dateDebut && dateFin) {
        timeRangeLabel = `${dateDebut} to ${dateFin}`;
      } else if (dateDebut) {
        timeRangeLabel = `From ${dateDebut}`;
      } else if (dateFin) {
        timeRangeLabel = `Until ${dateFin}`;
      }
    }

    res.status(200).json({
      ...(currentPeriodStats[0] || {
        moyenRevenue: 0,
        totalRevenue: 0,
        paymentMethodsTotalRevenue: { espece: 0, cb: 0 },
        deliveryTypes: { surPlace: 0, emporter: 0 },
      }),
      totalOrders: statusCounts[0]?.totalOrders || 0,
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
      message: "Erreur lors de la récupération des statistiques",
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
      return res.status(204).send("No pending print job");
    }

    // Marquer la commande comme "enAttente" (inProgress) pour éviter de l'imprimer à nouveau
    printJob.status = "enAttente";
    await printJob.save();

    res.status(200).json(printJob);
  } catch (error) {
    console.error("Error fetching print job:", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
};
