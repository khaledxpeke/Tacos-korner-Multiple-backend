const mongoose = require("mongoose");

const ingrediantSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  image: {
    type: String,
    default:
      "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    required: true,
  },
  product: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
  ],
  types: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Type",
      required: true,
    },
  ],
  price: {
    type: Number,
  },
  suppPrice: {
    type: Number,
    default: 0,
  },
  outOfStock: {
    type: Boolean,
    default: false,
  },
  visible: {
    type: Boolean,
    default: true,
  },
 variations: [
     {
       _id: { type: mongoose.Schema.Types.ObjectId, ref: "Variation" },
       price: {
         type: Number,
         default: 0,
       },
     },
   ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true
  }
});

module.exports = mongoose.model("Ingrediant", ingrediantSchema);
