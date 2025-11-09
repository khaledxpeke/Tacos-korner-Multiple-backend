// models/media.js
import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetType: { type: String, required: true }, // e.g., "restaurant", "product", "category"
    targetId: { type: mongoose.Schema.Types.ObjectId, refPath: "targetType" }, // e.g., restaurant._id
  },
  { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);
