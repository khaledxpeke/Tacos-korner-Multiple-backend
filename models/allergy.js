const mongoose = require("mongoose");

const AllergySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  icon: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Media",
      default: null 
    },
}, { timestamps: true });

module.exports = mongoose.model("Allergy", AllergySchema);