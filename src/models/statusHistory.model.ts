import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const HISTORY_STATUSES = [
  "enCours",
  "terminee",
  "annulee",
  "enRetard",
  "echouee",
  "remboursee",
  "enAttente",
] as const;

export type HistoryStatus = (typeof HISTORY_STATUSES)[number];

export interface IStatusHistory {
  historyId: Types.ObjectId;
  status: HistoryStatus;
  updatedBy: string;
  restaurantId?: Types.ObjectId;
}

export type StatusHistoryDocument = HydratedDocument<IStatusHistory>;

const statusHistorySchema = new Schema<IStatusHistory>(
  {
    historyId: {
      type: Schema.Types.ObjectId,
      ref: "History",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: HISTORY_STATUSES,
      required: true,
    },
    updatedBy: {
      type: String,
      required: true,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
    },
  },
  { timestamps: true }
);

export const StatusHistory = model<IStatusHistory>("StatusHistory", statusHistorySchema);
export default StatusHistory;
