import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IIngrediantVariation {
  _id?: Types.ObjectId;
  price: number;
}

export interface IIngrediant {
  name: string;
  image: Types.ObjectId | null;
  product: Types.ObjectId[];
  types: Types.ObjectId[];
  price?: number;
  suppPrice: number;
  outOfStock: boolean;
  visible: boolean;
  variations: IIngrediantVariation[];
  createdBy: Types.ObjectId;
  restaurantId: Types.ObjectId;
}

export type IngrediantDocument = HydratedDocument<IIngrediant>;

const ingrediantSchema = new Schema<IIngrediant>(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    product: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    types: [
      {
        type: Schema.Types.ObjectId,
        ref: "Type",
        required: true,
      },
    ],
    price: {
      type: Number,
    },
    suppPrice: {
      type: Number,
      default: 0,
    },
    outOfStock: {
      type: Boolean,
      default: false,
    },
    visible: {
      type: Boolean,
      default: true,
    },
    variations: [
      {
        _id: { type: Schema.Types.ObjectId, ref: "Variation" },
        price: {
          type: Number,
          default: 0,
        },
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  { timestamps: true }
);

export const Ingrediant = model<IIngrediant>("Ingrediant", ingrediantSchema);
export default Ingrediant;
