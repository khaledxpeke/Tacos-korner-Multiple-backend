const mongoose = require("mongoose");
const variationSchema = mongoose.Schema({
    name: {
      type: String,
      required: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true
    }
    
  });
  
  module.exports = mongoose.model("Variation", variationSchema);