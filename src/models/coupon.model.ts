import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ICoupon {
  code: string;
  couponType: "percentage" | "fixed";
  couponValue: number;
  minOrderAmount: number;
  isActive: boolean;
  limit: number;
  usageCount: number;
  startDate: Date;
  endDate: Date | null;
  categoryType: "all" | "categories" | "products" | "categories_products";
  couponCategories: Types.ObjectId[];
  couponProducts: Types.ObjectId[];
  excludeProducts: Types.ObjectId[];
  recurringDays: number[];
  restaurantId: Types.ObjectId;
}

export type CouponDocument = HydratedDocument<ICoupon>;

const couponSchema = new Schema<ICoupon>(
  {
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
    limit: {
      type: Number,
      default: 0,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    categoryType: {
      type: String,
      enum: ["all", "categories", "products", "categories_products"],
      default: "all",
    },
    couponCategories: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    couponProducts: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    excludeProducts: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    recurringDays: {
      type: [Number],
      default: [],
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.index({ restaurantId: 1, code: 1 }, { unique: true });
couponSchema.index({ restaurantId: 1, isActive: 1 });
couponSchema.index({ startDate: 1, endDate: 1 });

export const Coupon = model<ICoupon>("Coupon", couponSchema);
export default Coupon;
