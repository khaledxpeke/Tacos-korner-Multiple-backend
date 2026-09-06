import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IRestaurant {
  name: string;
  description?: string;
  settings?: Types.ObjectId;
  active: boolean;
  logo?: Types.ObjectId;
  address: string;
}

export type RestaurantDocument = HydratedDocument<IRestaurant>;

const restaurantSchema = new Schema<IRestaurant>(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    settings: {
      type: Schema.Types.ObjectId,
      ref: "Settings",
    },
    active: {
      type: Boolean,
      default: true,
    },
    logo: {
      type: Schema.Types.ObjectId,
      ref: "Media",
    },
    address: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Restaurant = model<IRestaurant>("Restaurant", restaurantSchema);
export default Restaurant;
