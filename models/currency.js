const mongoose = require("mongoose");

const currencySchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true, // EUR, USD, GBP
  },
  name: {
    type: String,
    required: true, // Euro, US Dollar
  },
  symbol: {
    type: String,
    required: true, 
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Currency", currencySchema);