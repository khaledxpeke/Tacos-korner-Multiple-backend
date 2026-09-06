import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ITypeIngredientItem {
  ingredient?: Types.ObjectId;
  position: number;
}

export interface ITypeProductItem {
  product?: Types.ObjectId;
  position: number;
}

export interface IType {
  name: string;
  label: string;
  message?: string;
  min: number;
  payment: boolean;
  selection: boolean;
  max: number;
  restaurantId: Types.ObjectId;
  mode: "INGREDIENTS" | "PRODUCTS";
  ingredients: ITypeIngredientItem[];
  products: ITypeProductItem[];
}

export type TypeDocument = HydratedDocument<IType>;

const typeSchema = new Schema<IType>(
  {
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
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    mode: {
      type: String,
      enum: ["INGREDIENTS", "PRODUCTS"],
      default: "INGREDIENTS",
    },
    ingredients: [
      {
        ingredient: { type: Schema.Types.ObjectId, ref: "Ingrediant" },
        position: { type: Number, default: 0 },
      },
    ],
    products: [
      {
        product: { type: Schema.Types.ObjectId, ref: "Product" },
        position: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

typeSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

typeSchema.pre("save", function (next) {
  if (this.mode === "INGREDIENTS") {
    this.products = [];
    if (this.payment === undefined) {
      this.payment = false;
    }
  } else if (this.mode === "PRODUCTS") {
    this.ingredients = [];
    this.payment = true;
  }
  if (this.min > this.max) {
    return next(new Error("min cannot be greater than max"));
  }
  next();
});

export const Type = model<IType>("Type", typeSchema);
export default Type;
