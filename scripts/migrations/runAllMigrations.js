const mongoose = require("mongoose");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const { migrateRestaurantMedia } = require("./migrateRestaurants");
const { migrateCategoryMedia } = require("./migrateCategories");
const { migrateSettingsMedia } = require("./migrateSettings");
const { migrateProductMedia } = require("./migrateProducts");
const { migrateIngrediantMedia } = require("./migrateIngrediants");

async function runAllMigrations() {
  console.log("🚀 STARTING COMPLETE MEDIA MIGRATION");
  console.log("=====================================\n");

  const startTime = Date.now();
  const finalReport = {};

  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("🟢 Connected to MongoDB.\n");

    // Phase 1: Restaurants (MUST run first)
    console.log("📍 PHASE 1: MIGRATING RESTAURANT LOGOS...\n");
    finalReport.restaurants = await migrateRestaurantMedia();

    // Phase 2: Categories
    console.log("\n📍 PHASE 2: MIGRATING CATEGORY IMAGES...\n");
    finalReport.categories = await migrateCategoryMedia();

    console.log("\n📍 PHASE 2: MIGRATING SETTINGS IMAGES...\n");
    finalReport.settings = await migrateSettingsMedia();

    console.log("\n📍 PHASE 2: MIGRATING PRODUCTS IMAGES...\n");
    finalReport.products = await migrateProductMedia();

    console.log("\n📍 PHASE 2: MIGRATING INGREDIENTS IMAGES...\n");
    finalReport.ingrediants = await migrateIngrediantMedia();

    // Final Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n==============================================");
    console.log("      🎉 FINAL MIGRATION REPORT 🎉          ");
    console.log("==============================================");
    console.log(
      `📊 Restaurants: ${finalReport.restaurants.successCount} ✅ | ${finalReport.restaurants.failCount} ❌`
    );
    console.log(
      `📊 Categories:  ${finalReport.categories.successCount} ✅ | ${finalReport.categories.failCount} ❌`
    );
    console.log(
      `📊 Settings:  ${finalReport.settings.successCount} ✅ | ${finalReport.settings.failCount} ❌`
    );
    console.log(
      `📊 Products:    ${finalReport.products.successCount} ✅ | ${finalReport.products.failCount} ❌`
    );
    console.log(
      `📊 Ingredients: ${finalReport.ingrediants.successCount} ✅ | ${finalReport.ingrediants.failCount} ❌`
    );
    console.log(`⏱️  Total Time: ${duration}s`);
    console.log("==============================================\n");
  } catch (error) {
    console.error("\n❌ FATAL ERROR:", error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log("🟡 Disconnected from MongoDB.");
    }
  }
}

runAllMigrations();
