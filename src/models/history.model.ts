import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import type { HistoryStatus } from "./statusHistory.model";

export interface IHistoryPlat {
  _id: string;
  category?: Types.ObjectId;
  name: string;
  price?: number;
  count?: number;
}

export interface IHistoryVariation {
  name?: string;
  price?: number | string;
}

export interface IHistoryAddon {
  name: string;
  count?: number;
  price?: number;
}

export interface IHistoryExtra {
  name: string;
  price?: number;
  count?: number;
}

export interface IHistoryProduct {
  plat: IHistoryPlat;
  variation?: IHistoryVariation | null;
  addons: IHistoryAddon[];
  extras: IHistoryExtra[];
  tva?: number;
  total?: number;
}

export interface IHistoryPack {
  _id: Types.ObjectId;
  label: string;
}

export interface IHistoryMethod {
  _id: Types.ObjectId;
  label: string;
}

export interface IHistory {
  product: IHistoryProduct[];
  pack: IHistoryPack;
  currency?: string;
  method: IHistoryMethod;
  name: string;
  email?: string;
  total: number;
  commandNumber?: number;
  logo: string;
  totalWithTVA?: number;
  tva?: number;
  discountValue: number;
  couponId: Types.ObjectId | null;
  status: HistoryStatus;
  boughtAt: Date;
  restaurantId: Types.ObjectId;
  /**
   * Written by print workflows but not declared on the legacy schema.
   * TODO: Legacy behavior preserved during TS migration.
   */
  printStatus?: string;
  lastPrintAttempt?: Date;
  printError?: string | null;
}

export type HistoryDocument = HydratedDocument<IHistory>;

const historySchema = new Schema<IHistory>(
  {
    product: [
      {
        plat: {
          _id: { type: String, required: true },
          category: { type: Schema.Types.ObjectId, ref: "Category" },
          name: { type: String, required: true },
          price: { type: Number },
          count: { type: Number },
        },
        variation: {
          name: { type: String },
          price: { type: Number },
        },
        addons: [
          {
            name: { type: String, required: true },
            count: { type: Number },
            price: { type: Number },
          },
        ],
        extras: [
          {
            name: { type: String, required: true },
            price: { type: Number },
            count: { type: Number },
          },
        ],
        tva: { type: Number },
        total: { type: Number },
      },
    ],
    pack: {
      _id: { type: Schema.Types.ObjectId, required: true },
      label: { type: String, required: true },
    },
    currency: { type: String },
    method: {
      _id: { type: Schema.Types.ObjectId, required: true },
      label: { type: String, required: true },
    },
    name: { type: String, required: true },
    email: { type: String },
    total: { type: Number, required: true },
    commandNumber: { type: Number },
    logo: { type: String, default: "uploads/logo.png" },
    totalWithTVA: { type: Number },
    tva: { type: Number },
    discountValue: { type: Number, default: 0 },
    couponId: { type: Schema.Types.ObjectId, ref: "Coupon", default: null },
    status: {
      type: String,
      default: "enCours",
      enum: ["enCours", "terminee", "annulee", "echouee", "enAttente", "remboursee", "enRetard"],
    },
    boughtAt: { type: Date, default: Date.now },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  },
  { timestamps: true }
);

export const History = model<IHistory>("History", historySchema);
export default History;
