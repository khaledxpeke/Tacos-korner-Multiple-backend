const mongoose = require("mongoose");
const typeSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
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
  },
  mode: {
    type: String,
    enum: ["INGREDIENTS", "PRODUCTS"],
    default: "INGREDIENTS"
  },
  ingredients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ingrediant"
  }],
  // When mode = PRODUCT → selectable extra products
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product"
  }]
}, { timestamps: true });

typeSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

typeSchema.pre("save", function(next) {
  if (this.mode === "INGREDIENTS") {
    this.products = [];
    if (this.payment === undefined) {
      this.payment = false;
    }
  } else if (this.mode === "PRODUCTS") {
    this.ingredients = [];
    // Force payment true for product extras
    this.payment = true;
  }
  if (this.min > this.max) {
    return next(new Error("min cannot be greater than max"));
  }
  next();
});

module.exports = mongoose.model("Type", typeSchema);
