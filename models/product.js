const mongoose = require("mongoose");
const Settings = require("./settings");
const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    price: {
      type: Number,
      required: true,
    },
    formulePrice: {
      type: Number,
      default: 0,
    },
    image: {
      type: String,
      required: true,
      default:
        "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    },
    // currency: {
    //   type: String,
    // },
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
      },
    ],
    typeVariations: {
      typeVariation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TypeVariation",
      },
      variations: [
        {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Variation",
          },
          price: {
            type: Number,
            default: 0,
          },
        },
      ],
    },
    // ingrediants: [{ type: mongoose.Schema.Types.ObjectId, ref: "Ingrediant" }],
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Type",
        required: true,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    choice: {
      type: String,
      default: "seul",
      enum: ["seul", "multiple"],
      required: true,
    },
    outOfStock: {
      type: Boolean,
      default: false,
    },
    visible: {
      type: Boolean,
      default: true,
    },
    position: {
      type: Number,
      default: 0,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    // Discount fields
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    originalPrice: {
      type: Number,
      default: null,
    },
    discountStartDate: {
      type: Date,
      default: null,
    },
    discountEndDate: {
      type: Date,
      default: null,
    },
    tva: {
      type: Number,
      default: 0,
      min: 0,
    },
    allergies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Allergy",
      },
    ],
    // rules : [{
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Rule",
    // }],
  },
  { timestamps: true }
);

// ProductSchema.pre("save", async function (next) {
//   try {
//     const settings = await Settings.findOne();
//     if (!settings) {
//       throw new Error("Settings not configured.");
//     }

//     if (!this.currency) {
//       console.log("Currency is missing, setting default:", settings.defaultCurrency);
//       this.currency = settings.defaultCurrency;
//     }
//     if (this.currency) {
//       this.currency = settings.defaultCurrency;
//     }

//     if (!settings.currencies.includes(this.currency)) {
//       throw new Error(`Invalid currency. Allowed values are: ${settings.currencies.join(", ")}`);
//     }
//     next();
//   } catch (error) {
//     next(error);
//   }
// });

const Product = mongoose.model("Product", ProductSchema);
module.exports = Product;
