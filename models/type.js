const mongoose = require("mongoose");
const typeSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  label: {
    type: String,
    required: true,
  },
  message: {
    type: String,
  },
  min: {
    type: Number,
    default: 0,
  },
  payment: {
    type: Boolean,
    default: false,
  },
  selection: {
    type: Boolean,
    default: false,
  },
  max: {
    type: Number,
    default: 1,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true
  }
});

module.exports = mongoose.model("Type", typeSchema);
