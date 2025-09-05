const Settings = require("../models/settings");
const Restaurant = require("../models/restaurant");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
const upload = multer({ storage: multerStorage });
const { default: mongoose } = require("mongoose");
const { encrypt } = require("../middleware/crypto");
let io;

exports.setIO = (socketIO) => {
  io = socketIO;
};

exports.addSettings = async (req, res) => {
  try {
    const { restaurantId } = req;

    const restaurant = await Restaurant.findOne({ _id: restaurantId }).populate(
      "settings"
    );

    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    const { currency } = req.body;
    if (!currency) {
      return res
        .status(400)
        .json({ message: req.t("settings.currency_required") });
    }
    let existing = null;
    if (restaurant.settings) {
      existing = await Settings.findOne({
        _id: restaurant.settings,
        restaurantId: restaurantId,
      });
    }
    if (existing) {
      if (existing.currencies.includes(currency.toUpperCase())) {
        return res
          .status(400)
          .json({ message: req.t("settings.currency_exists") });
      }

      existing.currencies.push(currency.toUpperCase());

      await existing.save();
      return res
        .status(200)
        .json({ existing, message: req.t("settings.currency_added") });
    } else {
      if (currency === undefined) {
        return res
          .status(400)
          .json({ message: req.t("settings.currency_required") });
      }
      const newSettings = new Settings({
        restaurantId: restaurantId,
        currencies: [currency.toUpperCase()],
        defaultCurrency: currency.toUpperCase(),
        tva: 10,
        method: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Carte bancaire",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Espèce",
            isActive: true,
          },
        ],
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
        emailName: process.env.EMAIL_NAME || "Restaurant",
      });
      await newSettings.save();
      restaurant.settings = newSettings._id;
      await restaurant.save();
      return res
        .status(201)
        .json({ newSettings, message: "La devise ajoutée avec succées" });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const { restaurantId } = req;

    // Find the restaurant first
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
        currencies: ["€", "$"],
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

exports.getSettingsRT = async (socket, req) => {
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
      // Create default settings if none exist (same as getSettings)
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
        currencies: ["€", "$"],
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

    socket.emit("join-restaurant", restaurantId);

    // Send initial settings
    const settingsObject = settings.toObject();
    settingsObject.isPasswordSet = !!settingsObject.emailPass;
    delete settingsObject.emailPass;

    socket.emit("settings-realtime-fetched", {
      restaurantId,
      settings: settingsObject,
    });

    socket.on("settings-updated", (data) => {
      socket.emit("settings-realtime-update", data);
    });

    socket.on("settings-fetched", (data) => {
      socket.emit("settings-realtime-fetched", data);
    });

    // res.status(200).json(settingsObject);
  } catch (error) {
    socket.emit("error", {
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

exports.getAllCurrencies = async (req, res) => {
  try {
    const { restaurantId } = req;

    const restaurant = await Restaurant.findOne({ _id: restaurantId }).populate(
      "settings"
    );

    if (!restaurant || !restaurant.settings) {
      return res
        .status(404)
        .json({ message: req.t("settings.param_not_found") });
    }
    const currencies = await Settings.findOne({
      _id: restaurant.settings,
      restaurantId: restaurantId,
    });
    if (!currencies) {
      return res
        .status(404)
        .json({ message: req.t("settings.currency_not_found") });
    }

    return res.status(200).json({
      currencies: currencies.currencies,
      defaultCurrency: currencies.defaultCurrency,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateDefaultCurrency = async (req, res) => {
  try {
    const { restaurantId } = req;

    const restaurant = await Restaurant.findOne({ _id: restaurantId }).populate(
      "settings"
    );

    if (!restaurant || !restaurant.settings) {
      return res
        .status(404)
        .json({ message: req.t("settings.param_not_found") });
    }

    const { defaultCurrency } = req.body;
    if (!defaultCurrency) {
      return res
        .status(400)
        .json({ message: req.t("settings.currency_default_required") });
    }
    const currencyDoc = await Settings.findOne({
      _id: restaurant.settings,
      restaurantId: restaurantId,
    });
    if (
      !currencyDoc ||
      !currencyDoc.currencies.includes(defaultCurrency.toUpperCase())
    ) {
      return res
        .status(400)
        .json({ message: req.t("settings.currency_invalid") });
    }

    currencyDoc.defaultCurrency = defaultCurrency.toUpperCase();
    await currencyDoc.save();

    return res.status(200).json({
      message: req.t("settings.currency_default_updated"),
      defaultCurrency: currencyDoc.defaultCurrency,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteCurrency = async (req, res) => {
  try {
    const { restaurantId } = req;

    const restaurant = await Restaurant.findOne({ _id: restaurantId }).populate(
      "settings"
    );

    if (!restaurant || !restaurant.settings) {
      return res
        .status(404)
        .json({ message: req.t("settings.param_not_found") });
    }

    const { currency } = req.body;
    if (!currency) {
      return res
        .status(400)
        .json({ message: req.t("settings.currency_required") });
    }

    const currencyDoc = await Settings.findOne({
      _id: restaurant.settings,
      restaurantId: restaurantId,
    });
    if (
      !currencyDoc ||
      !currencyDoc.currencies.includes(currency.toUpperCase())
    ) {
      return res
        .status(400)
        .json({ message: req.t("settings.currency_not_found") });
    }

    if (currencyDoc.currencies.length <= 1) {
      return res.status(400).json({
        message: req.t("settings.currency_last_delete_error"),
      });
    }
    currencyDoc.currencies = currencyDoc.currencies.filter(
      (c) => c !== currency.toUpperCase()
    );
    if (currencyDoc.defaultCurrency === currency.toUpperCase()) {
      currencyDoc.defaultCurrency = currencyDoc.currencies[0];
    }

    await currencyDoc.save();
    return res.status(200).json({
      message: req.t("settings.currency_deleted"),
      currencies: currencyDoc.currencies,
      defaultCurrency: currencyDoc.defaultCurrency,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  upload.single("banner")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("settings.image_upload_failed"),
        error: err.message,
      });
    }

    try {
      const { restaurantId } = req;
      // Find the restaurant first
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
        oldCurrency,
        newCurrency,
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

      if (oldCurrency && newCurrency) {
        const oldCurrencyUpper = oldCurrency.toUpperCase();
        const newCurrencyUpper = newCurrency.toUpperCase();

        if (!settings.currencies.includes(oldCurrencyUpper)) {
          return res
            .status(400)
            .json({ message: req.t("settings.old_currency_not_found") });
        }
        if (
          settings.currencies.includes(newCurrencyUpper) &&
          oldCurrencyUpper !== newCurrencyUpper
        ) {
          return res
            .status(400)
            .json({ message: req.t("settings.new_currency_exists") });
        }

        settings.currencies = settings.currencies.map((c) =>
          c === oldCurrencyUpper ? newCurrencyUpper : c
        );
        if (settings.defaultCurrency === oldCurrencyUpper) {
          settings.defaultCurrency = newCurrencyUpper;
        }
      }

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
        const banner = `uploads\\${req.file.filename}`;
        const oldImagePath = path.join(__dirname, "..", settings.banner);

        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }

        settings.banner = banner;
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
          // Only update if a new password is provided
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
        io.to(`restaurant-${restaurantId}`).emit("settings-updated", {
          id: settings._id,
          restaurantId,
          message: "Settings have been updated. Please refresh.",
          settings,
          updatedAt: new Date().toISOString(),
        });
        console.log(
          "Emitted settings-updated to room:",
          `restaurant-${restaurantId}`
        ); // Move this HERE
      } else {
        console.log("io is not defined, emit skipped");
      }
      return res.status(200).json({
        message: req.t("settings.updated_success"),
        settings,
      });
    } catch (error) {
      if (req.files) {
        Object.values(req.files).forEach((files) => {
          files.forEach((file) => {
            fs.unlinkSync(
              path.join(__dirname, "..", `uploads\\${file.filename}`)
            );
          });
        });
      }
      return res.status(500).json({ error: error.message });
    }
  });
};
