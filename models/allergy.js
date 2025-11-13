const mongoose = require("mongoose");

const AllergySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  icon: {
    type: String,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Allergy", AllergySchema);