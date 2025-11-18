const mongoose = require("mongoose");
const methodSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: "Card",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);
const packSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: "Sur Place",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const settingsSchema = new mongoose.Schema(
  {
    defaultCurrency: {
      type: String,
      uppercase: true,
      default: "€",
    },
    tva: {
      type: Number,
      min: 0,
      default: 0,
    },
    maxExtras: {
      type: Number,
      default: 1,
    },
    maxDessert: {
      type: Number,
      default: 1,
    },
    maxDrink: {
      type: Number,
      default: 1,
    },
    banner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    address: {
      type: String,
      default: "Votre adresse",
    },
    carouselDuration: {
      type: Number,
      default: 5,
    },
    carouselTiming: {
      type: Number,
      default: 120,
    },
    qrCode: {
      type: String,
      default: "https://www.google.com",
    },
    host: {
      type: String,
      default: "smtp.example.com",
    },
    port: {
      type: Number,
      default: 587,
    },
    emailUser: {
      type: String,
      default: "",
    },
    emailPass: {
      type: String,
      default: "",
    },
    emailSender: {
      type: String,
      default: "",
    },
    emailName: {
      type: String,
      default: "",
    },
    method: [methodSchema],
    pack: [packSchema],
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },
    printMode: {
      type: Boolean,
      default: true,
      description:
        "true = server triggers print, false = frontend/mobile handles print",
    },
    printerIp: {
      type: String,
      default: "127.0.0.1",
    },
    printerUrl: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Settings", settingsSchema);
