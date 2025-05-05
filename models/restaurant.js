const mongoose = require("mongoose");

const restaurantSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  settings: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Settings"
  },
  active: {
    type: Boolean,
    default: true,
  },
  logo: {
    type: String,
    default: "uploads/default-logo.png",
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("Restaurant", restaurantSchema);