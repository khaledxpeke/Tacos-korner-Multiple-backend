import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IMethod {
  _id: Types.ObjectId;
  label: string;
  isActive?: boolean;
}

export interface IPack {
  _id: Types.ObjectId;
  label: string;
  isActive: boolean;
}

export interface ISettings {
  defaultCurrency: string;
  defaultLanguage: string;
  tva: number;
  maxExtras: number;
  maxDessert: number;
  maxDrink: number;
  banner: Types.ObjectId | null;
  address: string;
  carouselDuration: number;
  carouselTiming: number;
  qrCode: string;
  host: string;
  port: number;
  emailUser: string;
  emailPass: string;
  emailSender: string;
  emailName: string;
  method: IMethod[];
  pack: IPack[];
  restaurantId?: Types.ObjectId;
  printMode: boolean;
  printerIp: string;
  printerUrl: string;
  /** Points earned for each 1 of the restaurant currency actually paid. */
  loyaltyEarnPoints: number;
  /** Points required to take 1 of the restaurant currency off an order.
   * Also the minimum balance required before any cashback is applied. */
  loyaltyRedeemPoints: number;
  /** Largest share of the order (after coupon) that points can pay. 50 = half. */
  loyaltyMaxPercent: number;
}

export type SettingsDocument = HydratedDocument<ISettings>;

const methodSchema = new Schema<IMethod>(
  {
    label: {
      type: String,
      default: "Card",
    },
    isActive: {
      type: Boolean,
    },
  },
  { _id: true }
);

const packSchema = new Schema<IPack>(
  {
    label: {
      type: String,
      default: "Sur Place",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const settingsSchema = new Schema<ISettings>(
  {
    defaultCurrency: {
      type: String,
      uppercase: true,
      default: "€",
    },
    defaultLanguage: {
      type: String,
      lowercase: true,
      enum: ["fr", "en", "ar"],
      default: "fr",
    },
    tva: {
      type: Number,
      min: 0,
      default: 0,
    },
    maxExtras: {
      type: Number,
      default: 1,
    },
    maxDessert: {
      type: Number,
      default: 1,
    },
    maxDrink: {
      type: Number,
      default: 1,
    },
    banner: {
      type: Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    address: {
      type: String,
      default: "Votre adresse",
    },
    carouselDuration: {
      type: Number,
      default: 5,
    },
    carouselTiming: {
      type: Number,
      default: 120,
    },
    qrCode: {
      type: String,
      default: "https://www.google.com",
    },
    host: {
      type: String,
      default: "smtp.example.com",
    },
    port: {
      type: Number,
      default: 587,
    },
    emailUser: {
      type: String,
      default: "",
    },
    emailPass: {
      type: String,
      default: "",
    },
    emailSender: {
      type: String,
      default: "",
    },
    emailName: {
      type: String,
      default: "",
    },
    method: [methodSchema],
    pack: [packSchema],
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
    },
    printMode: {
      type: Boolean,
      default: true,
    },
    printerIp: {
      type: String,
      default: "127.0.0.1",
    },
    printerUrl: {
      type: String,
      default: "",
    },
    loyaltyEarnPoints: {
      type: Number,
      default: 1,
      min: 1,
    },
    loyaltyRedeemPoints: {
      type: Number,
      default: 100,
      min: 1,
    },
    loyaltyMaxPercent: {
      type: Number,
      default: 50,
      min: 1,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

export const Settings = model<ISettings>("Settings", settingsSchema);
export default Settings;
