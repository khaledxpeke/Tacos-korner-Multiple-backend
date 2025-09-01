const mongoose = require("mongoose");
const typeVariationSchema = mongoose.Schema({
    name: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    variations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Variation",
      },
    ],
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true
    }
  }, { timestamps: true });
  
  module.exports = mongoose.model("TypeVariation", typeVariationSchema);