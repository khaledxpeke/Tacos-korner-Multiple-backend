import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IMedia {
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  hash?: string;
  uploadedBy?: Types.ObjectId;
  type: string;
  targetType?: string;
  targetId?: Types.ObjectId;
  restaurantId?: Types.ObjectId;
  scope: "restaurant" | "shared";
}

export type MediaDocument = HydratedDocument<IMedia>;

const mediaSchema = new Schema<IMedia>(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    hash: { type: String, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    type: { type: String, required: true, trim: true },
    targetType: { type: String },
    targetId: { type: Schema.Types.ObjectId, refPath: "targetType" },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant" },
    scope: {
      type: String,
      enum: ["restaurant", "shared"],
      default: "shared",
    },
  },
  { timestamps: true }
);

mediaSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

mediaSchema.index(
  { hash: 1, restaurantId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      hash: { $exists: true, $ne: null },
      scope: "shared",
    },
  }
);

export const Media = model<IMedia>("Media", mediaSchema);
export default Media;
