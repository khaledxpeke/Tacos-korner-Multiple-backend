const mongoose = require("mongoose");

const restaurantSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    settings: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Settings",
    },
    active: {
      type: Boolean,
      default: true,
    },
    logo: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Media",
    },
    address: {
      type: String,
      required: true,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true }, // ✅ MUST enable this
    toObject: { virtuals: true } // ✅ Optional but recommended
  }
);

restaurantSchema.virtual('logoUrl').get(function() {
  return this.logo?.url || null;
});

module.exports = mongoose.model("Restaurant", restaurantSchema);
