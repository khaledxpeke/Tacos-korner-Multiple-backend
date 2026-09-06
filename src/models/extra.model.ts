import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IExtra {
  name: string;
  image: string;
  price?: number;
  outOfStock: boolean;
  visible: boolean;
  createdBy: Types.ObjectId;
  restaurantId: Types.ObjectId;
}

export type ExtraDocument = HydratedDocument<IExtra>;

const extraSchema = new Schema<IExtra>(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      default:
        "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    },
    price: {
      type: Number,
    },
    outOfStock: {
      type: Boolean,
      default: false,
    },
    visible: {
      type: Boolean,
      default: true,
    },
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

export const Extra = model<IExtra>("Extra", extraSchema);
export default Extra;
