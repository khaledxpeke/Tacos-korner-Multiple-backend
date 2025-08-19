const mongoose = require("mongoose");
const couponSchema = mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
  },
  couponType: {
    type: String,
    enum: ["percentage", "fixed"],
    required: true,
  },
  couponValue: {
    type: Number,
    required: true,
    min: 0,
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  startDate: {
    type: Date,
    default: Date.now, // Can start immediately or set future date
  },
  endDate: {
    type: Date,
    default: null, // null = no end date
  },
  categoryType: {
    type: String,
    enum: ["all", "categories", "products", "categories_products"],
    default: "all",
  },
  couponCategories: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
  ],
  couponProducts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
  ],
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
},
{
  timestamps: true,
});

couponSchema.index({ restaurantId: 1, code: 1 }, { unique: true });
couponSchema.index({ restaurantId: 1, isActive: 1 });
couponSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model("Coupon", couponSchema);
