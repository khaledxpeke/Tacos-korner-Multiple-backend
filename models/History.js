const mongoose = require("mongoose");

const historySchema = mongoose.Schema({
  product: [
    {
      plat: {
        _id: { type: String, required: true },
        category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
        name: { type: String, required: true },
        price: { type: Number },
        count: { type: Number },
      },
      variation:
        {
          // _id: { type: mongoose.Schema.Types.ObjectId, ref: "Variation" },
          name: { type: String },
          price: { type: Number },
        },
      addons: [
        {
          // _id: { type: String },
          name: { type: String, required: true },
          count: { type: Number },
          price: { type: Number },
        },
      ],
      extras: [
        {
          // _id: { type: String, required: true },
          name: { type: String, required: true },
          price: { type: Number },
          count: { type: Number },
        },
      ],
      total: { type: Number },
    },
  ],
  pack: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
  },
  currency: { type: String },
  method: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  total: {
    type: Number,
    required: true,
  },
  commandNumber: {
    type: Number,
  },
  logo: {
    type: String,
    default: "uploads/logo.png",
  },
  totalWithTVA: {
    type: Number,
  },
  tva: {
    type: Number,
  },
  status: { type: String, default: "enCours", enum: ["enCours", "terminee", "annulee", "echouee","enAttente","remboursee","enRetard"] },
  boughtAt: {
    type: Date,
    default: Date.now,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true
  }
});

module.exports = mongoose.model("History", historySchema);
