import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IDrink {
  name: string;
  price: number;
  image: string;
  outOfStock: boolean;
  visible: boolean;
  restaurantId: Types.ObjectId;
}

export type DrinkDocument = HydratedDocument<IDrink>;

const drinkSchema = new Schema<IDrink>(
  {
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    image: {
      type: String,
      default:
        "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    },
    outOfStock: {
      type: Boolean,
      default: false,
    },
    visible: {
      type: Boolean,
      default: true,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  { timestamps: true }
);

export const Drink = model<IDrink>("Drink", drinkSchema);
export default Drink;
