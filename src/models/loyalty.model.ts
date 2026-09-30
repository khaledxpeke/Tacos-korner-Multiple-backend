import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ILoyaltyAccount {
  userId: Types.ObjectId;
  phone: string;
  code: string;
  balance: number;
}

export type LoyaltyAccountDocument = HydratedDocument<ILoyaltyAccount>;

const loyaltyAccountSchema = new Schema<ILoyaltyAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    balance: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export const LoyaltyAccount = model<ILoyaltyAccount>("LoyaltyAccount", loyaltyAccountSchema);

export interface ILoyaltyLedger {
  userId: Types.ObjectId;
  restaurantId: Types.ObjectId;
  historyId: Types.ObjectId;
  type: "earn" | "redeem";
  points: number;
  balanceAfter: number;
}

const loyaltyLedgerSchema = new Schema<ILoyaltyLedger>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    historyId: { type: Schema.Types.ObjectId, ref: "History", required: true },
    type: { type: String, enum: ["earn", "redeem"], required: true },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: true }
);

export const LoyaltyLedger = model<ILoyaltyLedger>("LoyaltyLedger", loyaltyLedgerSchema);

export interface ILoyaltySession {
  token: string;
  restaurantId: Types.ObjectId;
  userId?: Types.ObjectId | null;
  expiresAt: Date;
}

const loyaltySessionSchema = new Schema<ILoyaltySession>(
  {
    token: { type: String, required: true, unique: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

loyaltySessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoyaltySession = model<ILoyaltySession>("LoyaltySession", loyaltySessionSchema);
