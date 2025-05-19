// Migration script: Assigns all existing data to a default restaurant for multi-restaurant support

const mongoose = require("mongoose");
const Restaurant = require("../models/restaurant");
const Variation = require("../models/variation");
const User = require("../models/user");
const TypeVariation = require("../models/typeVariations");
const Type = require("../models/type");
const StatusHistory = require("../models/statusHistory");
const Settings = require("../models/settings");
const Product = require("../models/product");
const Ingrediant = require("../models/ingrediant");
const History = require("../models/History");
const Extra = require("../models/extra");
const Drink = require("../models/drink");
const Desert = require("../models/desert");
const Category = require("../models/category");
const CarouselMedia = require("../models/carouselMedia");

const MONGO_URI =
  process.env.DATABASE_URL;

async function migrate() {
  await mongoose.connect(MONGO_URI);

  // 1. Create default restaurant
  // let defaultRestaurant = await Restaurant.findOne({ name: 'Default Restaurant' });
  // if (!defaultRestaurant) {
  //   defaultRestaurant = await Restaurant.create({ name: 'Default Restaurant' });
  // }

  // const restaurantId = defaultRestaurant._id;

  const restaurantId = "682b35104934f6a6aea436d2";
  if (!restaurantId) {
    console.error("Please provide RESTAURANT_ID as an environment variable.");
    process.exit(1);
  }
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    console.error("No restaurant found with the provided RESTAURANT_ID.");
    process.exit(1);
  }
  // 2. Update all collections to set restaurantId where missing
  const updateOps = [
    Variation.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    User.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    TypeVariation.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Type.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    StatusHistory.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Settings.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Product.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Ingrediant.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    History.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Extra.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Drink.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Desert.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    Category.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
    CarouselMedia.updateMany(
      { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
      { restaurantId }
    ),
  ];

  await Promise.all(updateOps);

  console.log(
    "Migration complete. All existing data assigned to Default Restaurant."
  );
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
