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

const settingsSchema = new mongoose.Schema({
  currencies: {
    type: [String],
    default: ["€", "$", "£"],
  },
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
  logo: {
    type: String,
    default: "uploads/default-logo.png",
  },
  banner: {
    type: String,
    default: "uploads/default-banner.png",
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
  method: [methodSchema],
  pack: [packSchema],
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant"
  }
});

module.exports = mongoose.model("Settings", settingsSchema);
