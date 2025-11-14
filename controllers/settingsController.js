const Settings = require("../models/settings");
const Restaurant = require("../models/restaurant");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const { default: mongoose } = require("mongoose");
const { encrypt } = require("../middleware/crypto");
const Currency = require("../models/currency");
const { forwardToMediaBackend } = require("../utils/mediaHelper");
const localUpload = require("../middleware/localMulter");
const Media = require("../models/media");
const cleanupTempFile = require("../utils/cleanupTempFiles");
let io;

exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.getSettings = async (req, res) => {
  try {
    const { restaurantId } = req;

    const restaurant = await Restaurant.findOne({ _id: restaurantId }).populate(
      "settings"
    );

    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }
    let settings = null;
    if (restaurant.settings) {
      settings = await Settings.findOne({
        _id: restaurant.settings,
        restaurantId: restaurantId,
      });
    }
    if (!settings) {
      settings = new Settings({
        restaurantId: restaurantId,
        tva: 10,
        method: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Espèce",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Carte bancaire",
            isActive: true,
          },
        ],
        defaultCurrency: "€",
        maxExtras: 5,
        maxDessert: 5,
        maxDrink: 5,
        pack: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Sur Place",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "À emporter",
            isActive: true,
          },
        ],
        carouselDuration: 5,
        carouselTiming: 120,
        qrCode: "https://www.google.com",
        host: process.env.EMAIL_HOST || "smtp.example.com",
        port: process.env.EMAIL_PORT || 587,
        emailPass: process.env.EMAIL_PASSWORD || "",
        emailSender: process.env.EMAIL_SENDER || "",
        emailUser: process.env.EMAIL_USER || "",
        emailName: process.env.EMAIL_NAME || "Restaurant",
      });

      await settings.save();
      restaurant.settings = settings._id;
      await restaurant.save();
    }

    const settingsObject = settings.toObject();
    settingsObject.isPasswordSet = !!settingsObject.emailPass;
    delete settingsObject.emailPass;

    return res.status(200).json(settingsObject);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({ isActive: true }).sort({
      code: 1,
    });

    if (!currencies || currencies.length === 0) {
      return res
        .status(404)
        .json({ message: req.t("currency.no_currencies_found") });
    }

    const { restaurantId } = req;
    const restaurant = await Restaurant.findOne({ _id: restaurantId }).populate(
      "settings"
    );

    const defaultSymbol = restaurant?.settings?.defaultCurrency || "€";

    return res.status(200).json({
      currencies: currencies.map((c) => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
      })),
      defaultCurrency: defaultSymbol,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateDefaultCurrency = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { defaultCurrency } = req.body;

    if (!defaultCurrency) {
      return res.status(400).json({
        message: req.t("settings.currency_default_required"),
      });
    }
    const currencyExists = await Currency.findOne({
      code: defaultCurrency.toUpperCase(),
      isActive: true,
    });

    if (!currencyExists) {
      return res.status(400).json({
        message: req.t("settings.currency_invalid"),
      });
    }

    const restaurant = await Restaurant.findOne({ _id: restaurantId }).populate(
      "settings"
    );

    if (!restaurant || !restaurant.settings) {
      return res
        .status(404)
        .json({ message: req.t("settings.param_not_found") });
    }

    // Update default currency
    restaurant.settings.defaultCurrency = currencyExists.symbol;
    await restaurant.settings.save();

    if (io) {
      io.to(`restaurant-${restaurantId}`).emit(
        "settings-updated",
        restaurant.settings
      );
    }

    return res.status(200).json({
      message: req.t("settings.currency_default_updated"),
      defaultCurrency: currencyExists.symbol,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  const upload = localUpload.single("banner");
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("settings.image_upload_failed"),
        error: err.message,
      });
    }
    let tempFilePath = null;

    try {
      const { restaurantId } = req;
      const restaurant = await Restaurant.findOne({ _id: restaurantId });

      if (!restaurant) {
        return res.status(404).json({ message: req.t("restaurant.not_found") });
      }

      // Find or create settings
      let settings = null;
      if (restaurant.settings) {
        settings = await Settings.findOne({
          _id: restaurant.settings,
          restaurantId,
        });
      }

      if (!settings) {
        return res
          .status(404)
          .json({ message: req.t("settings.param_not_found") });
      }
      const {
        tva,
        maxExtras,
        maxDessert,
        maxDrink,
        method,
        pack,
        address,
        carouselDuration,
        carouselTiming,
        qrCode,
        host,
        port,
        emailUser,
        emailPass,
        emailSender,
        emailName,
        printMode,
        printerIp,
      } = req.body;

      if (tva !== undefined) {
        if (tva < 0) {
          return res
            .status(400)
            .json({ message: req.t("settings.tva_positive") });
        }
        settings.tva = tva;
        settings.maxExtras = maxExtras || settings.maxExtras;
        settings.maxDessert = maxDessert || settings.maxDessert;
        settings.maxDrink = maxDrink || settings.maxDrink;
      }

      if (method) {
        const parsedMethods = JSON.parse(method);
        settings.method = parsedMethods.map((updatedMethod) => {
          if (updatedMethod._id) {
            const existingMethod = settings.method.find(
              (m) => m._id.toString() === updatedMethod._id
            );
            if (existingMethod) {
              return {
                _id: existingMethod._id,
                label: updatedMethod.label,
                isActive:
                  updatedMethod.isActive !== undefined
                    ? updatedMethod.isActive
                    : existingMethod.isActive,
              };
            }
          }
          return {
            _id: updatedMethod._id || new mongoose.Types.ObjectId(),
            label: updatedMethod.label,
            isActive:
              updatedMethod.isActive !== undefined
                ? updatedMethod.isActive
                : true,
          };
        });
      }
      if (pack) {
        const parsedPacks = JSON.parse(pack);
        settings.pack = parsedPacks.map((updatedPack) => {
          if (updatedPack._id) {
            const existingPack = settings.pack.find(
              (m) => m._id.toString() === updatedPack._id
            );
            if (existingPack) {
              return {
                _id: existingPack._id,
                label: updatedPack.label,
                isActive:
                  updatedPack.isActive !== undefined
                    ? updatedPack.isActive
                    : existingPack.isActive,
              };
            }
          }
          return {
            _id: updatedPack._id || new mongoose.Types.ObjectId(),
            label: updatedPack.label,
            isActive:
              updatedPack.isActive !== undefined ? updatedPack.isActive : true,
          };
        });
      }
      if (req.file) {
        tempFilePath = req.file.path;

        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: restaurantId.toString(),
          type: "banners",
          originalname: req.file.originalname,
        });

        const mediaDoc = new Media({
          filename: req.file.originalname,
          url: mediaResponse.url,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: req.user?.user?._id,
          targetType: "settings",
          targetId: settings._id,
        });
        await mediaDoc.save();

        settings.banner = mediaResponse.url;

        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      if (address) {
        settings.address = address
          .split("\n")
          .filter((line) => line.trim())
          .join("\n");
      }
      if (qrCode) {
        const qrCodeUrl = qrCode.trim();
        if (qrCodeUrl) {
          settings.qrCode = qrCodeUrl;
        }
      }
      if (carouselDuration) {
        settings.carouselDuration =
          carouselDuration || settings.carouselDuration;
      }
      if (carouselTiming) {
        settings.carouselTiming = carouselTiming || settings.carouselTiming;
      }
      if (host) {
        settings.host = host || settings.host;
      }
      if (port) {
        settings.port = port || settings.port;
      }
      if (emailUser) {
        settings.emailUser = emailUser || settings.emailUser;
      }
      if (emailPass) {
        const cleanedPass = emailPass.replace(/"/g, "").replace(/'/g, "");
        if (cleanedPass) {
          settings.emailPass = encrypt(cleanedPass);
        }
      }
      if (emailSender) {
        settings.emailSender = emailSender || settings.emailSender;
      }
      if (emailName) {
        settings.emailName = emailName || settings.emailName;
      }
      if (printMode) {
        settings.printMode = printMode || settings.printMode;
      }
      if (printMode) {
        settings.printerUrl = `${process.env.CAROUSEL_URL}/printer/get-job?printerId=${restaurantId}`;
      }
      if (printerIp) {
        settings.printerIp = printerIp || settings.printerIp;
      }

      await settings.save();
      console.log(
        "About to emit settings-updated for restaurantId:",
        restaurantId
      );
      console.log("io is defined:", !!io);
      if (io) {
        io.to(`restaurant-${restaurantId}`).emit("settings-updated", settings);
        console.log(
          "Emitted settings-updated to room:",
          `restaurant-${restaurantId}`
        );
      } else {
        console.log("io is not defined, emit skipped");
      }
      return res.status(200).json({
        message: req.t("settings.updated_success"),
        settings,
      });
    } catch (error) {
      await cleanupTempFile(tempFilePath);
      return res.status(500).json({ error: error.message });
    }
  });
};
