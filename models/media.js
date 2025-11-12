// models/media.js
const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    hash: { type: String, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetType: { type: String }, // e.g., "restaurant", "product", "category"
    targetId: { type: mongoose.Schema.Types.ObjectId, refPath: "targetType" },
  },
  { timestamps: true }
);
mediaSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
module.exports = mongoose.model("Media", mediaSchema);
