import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IProductTypeVariationItem {
  _id?: Types.ObjectId;
  price: number;
}

export interface IProductTypeVariations {
  typeVariation?: Types.ObjectId;
  variations: IProductTypeVariationItem[];
}

export interface IProduct {
  name: string;
  description?: string;
  price: number;
  formulePrice: number;
  image: Types.ObjectId | null;
  categories: Types.ObjectId[];
  typeVariations?: IProductTypeVariations;
  type: Types.ObjectId[];
  createdBy: Types.ObjectId;
  choice: "seul" | "multiple";
  outOfStock: boolean;
  visible: boolean;
  position: number;
  restaurantId: Types.ObjectId;
  discountValue: number;
  originalPrice: number | null;
  discountStartDate: Date | null;
  discountEndDate: Date | null;
  tva: number;
  allergies: Types.ObjectId[];
}

export type ProductDocument = HydratedDocument<IProduct>;

const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    price: {
      type: Number,
      required: true,
    },
    formulePrice: {
      type: Number,
      default: 0,
    },
    image: {
      type: Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    categories: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true,
      },
    ],
    typeVariations: {
      typeVariation: {
        type: Schema.Types.ObjectId,
        ref: "TypeVariation",
      },
      variations: [
        {
          _id: {
            type: Schema.Types.ObjectId,
            ref: "Variation",
          },
          price: {
            type: Number,
            default: 0,
          },
        },
      ],
    },
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: "Type",
        required: true,
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    choice: {
      type: String,
      default: "seul",
      enum: ["seul", "multiple"],
      required: true,
    },
    outOfStock: {
      type: Boolean,
      default: false,
    },
    visible: {
      type: Boolean,
      default: true,
    },
    position: {
      type: Number,
      default: 0,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    originalPrice: {
      type: Number,
      default: null,
    },
    discountStartDate: {
      type: Date,
      default: null,
    },
    discountEndDate: {
      type: Date,
      default: null,
    },
    tva: {
      type: Number,
      default: 0,
      min: 0,
    },
    allergies: [
      {
        type: Schema.Types.ObjectId,
        ref: "Allergy",
      },
    ],
  },
  { timestamps: true }
);

export const Product = model<IProduct>("Product", ProductSchema);
export default Product;
