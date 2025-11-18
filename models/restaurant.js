const mongoose = require("mongoose");

const restaurantSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    settings: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Settings",
    },
    active: {
      type: Boolean,
      default: true,
    },
    logo: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Media",
    },
    address: {
      type: String,
      required: true,
    },
  },
  { 
    timestamps: true,
  }
);



module.exports = mongoose.model("Restaurant", restaurantSchema);
