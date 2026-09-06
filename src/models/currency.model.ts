import { Schema, model, type HydratedDocument } from "mongoose";

export interface ICurrency {
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
}

export type CurrencyDocument = HydratedDocument<ICurrency>;

const currencySchema = new Schema<ICurrency>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const Currency = model<ICurrency>("Currency", currencySchema);
export default Currency;
