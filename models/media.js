// models/media.js
const mongoose = require("mongoose");

const mediaSchema = mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    hash: { type: String, index: true }, 
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: { type: String, required: true, trim: true }, 
    targetType: { type: String }, 
    targetId: { type: mongoose.Schema.Types.ObjectId, refPath: "targetType" },
    restaurantId: { type: String }, 
  },
  { timestamps: true }
);

mediaSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

mediaSchema.index(
  { hash: 1, restaurantId: 1, type: 1 },
  { unique: true, partialFilterExpression: { hash: { $exists: true, $ne: null } } } 
);

module.exports = mongoose.model("Media", mediaSchema);