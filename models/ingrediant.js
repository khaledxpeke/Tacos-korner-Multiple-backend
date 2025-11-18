const mongoose = require("mongoose");

const ingrediantSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    product: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    types: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Type",
        required: true,
      },
    ],
    price: {
      type: Number,
    },
    suppPrice: {
      type: Number,
      default: 0,
    },
    outOfStock: {
      type: Boolean,
      default: false,
    },
    visible: {
      type: Boolean,
      default: true,
    },
    variations: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "Variation" },
        price: {
          type: Number,
          default: 0,
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ingrediant", ingrediantSchema);
