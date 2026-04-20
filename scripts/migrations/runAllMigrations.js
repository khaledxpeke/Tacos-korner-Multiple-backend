require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const { getMediaBackendBaseUrl } = require("../../utils/migrationUtils");

const { migrateRestaurantMedia } = require("./migrateRestaurants");
const { migrateCategoryMedia } = require("./migrateCategories");
const { migrateSettingsMedia } = require("./migrateSettings");
const { migrateProductMedia } = require("./migrateProducts");
const { migrateIngrediantMedia } = require("./migrateIngrediants");

const ERRORS_PER_PHASE = Number(process.env.MIGRATION_ERROR_LOG_LIMIT || 40);

function maskConnectionString(url) {
  if (!url || typeof url !== "string") return "(not set)";
  const masked = url.replace(/^(mongodb(\+srv)?:\/\/)([^:]+):([^@]+)@/i, "$1***:***@");
  return masked.length > 120 ? `${masked.slice(0, 100)}…` : masked;
}

function logPhaseReport(label, result) {
  if (!result) {
    console.log(`\n── ${label} ── (no result)\n`);
    return;
  }
  const { successCount = 0, failCount = 0, errors = [] } = result;
  console.log(`\n── ${label} ──`);
  console.log(`   Success: ${successCount} | Failed: ${failCount}`);
  if (errors.length > 0) {
    const slice = errors.slice(0, ERRORS_PER_PHASE);
    console.log(
      `   Sample errors (showing ${slice.length} of ${errors.length}):`
    );
    slice.forEach((line, i) => {
      console.log(`   [${i + 1}] ${line}`);
    });
    if (errors.length > slice.length) {
      console.log(
        `   … ${errors.length - slice.length} more not printed (raise MIGRATION_ERROR_LOG_LIMIT)`
      );
    }
  }
}

async function runPhase(name, fn) {
  const t0 = Date.now();
  console.log(`\n▶ ${name} (starting)…`);
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    console.log(`   Done in ${(ms / 1000).toFixed(2)}s`);
    logPhaseReport(name, result);
    return result;
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`\n❌ ${name} threw after ${(ms / 1000).toFixed(2)}s`);
    console.error("   Message:", err.message);
    if (err.stack) console.error(err.stack);
    throw err;
  }
}

async function runAllMigrations() {
  console.log("🚀 STARTING COMPLETE MEDIA MIGRATION");
  console.log("=====================================\n");

  console.log("── Environment (sanitized) ──");
  console.log("   DATABASE_URL:", maskConnectionString(process.env.DATABASE_URL));
  console.log(
    "   MEDIA_SERVER_URL (raw):",
    process.env.MEDIA_SERVER_URL || "(unset → default http://localhost:4000)"
  );
  try {
    const base = getMediaBackendBaseUrl();
    console.log("   Media hash endpoint:", `${base}/api/media/hash`);
  } catch (e) {
    console.log("   Media base URL error:", e.message);
  }
  console.log("   Error log limit per phase:", ERRORS_PER_PHASE);
  console.log("");

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is missing. Set it in .env");
    process.exit(1);
  }

  const startTime = Date.now();
  const finalReport = {};

  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("🟢 Connected to MongoDB.\n");

    finalReport.restaurants = await runPhase(
      "PHASE 1 — Restaurant logos",
      migrateRestaurantMedia
    );

    finalReport.categories = await runPhase(
      "PHASE 2a — Category images",
      migrateCategoryMedia
    );

    finalReport.settings = await runPhase(
      "PHASE 2b — Settings / banner images",
      migrateSettingsMedia
    );

    finalReport.products = await runPhase(
      "PHASE 2c — Product images",
      migrateProductMedia
    );

    finalReport.ingrediants = await runPhase(
      "PHASE 2d — Ingredient images",
      migrateIngrediantMedia
    );

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
      `📊 Settings:    ${finalReport.settings.successCount} ✅ | ${finalReport.settings.failCount} ❌`
    );
    console.log(
      `📊 Products:    ${finalReport.products.successCount} ✅ | ${finalReport.products.failCount} ❌`
    );
    console.log(
      `📊 Ingredients: ${finalReport.ingrediants.successCount} ✅ | ${finalReport.ingrediants.failCount} ❌`
    );
    console.log(`⏱️  Total time: ${duration}s`);
    console.log("==============================================");

    const phases = [
      ["Restaurants", finalReport.restaurants],
      ["Categories", finalReport.categories],
      ["Settings", finalReport.settings],
      ["Products", finalReport.products],
      ["Ingredients", finalReport.ingrediants],
    ];
    let totalErrLines = 0;
    for (const [, r] of phases) {
      totalErrLines += (r.errors || []).length;
    }
    if (totalErrLines > 0) {
      console.log("\n── ROLLUP: all recorded errors by phase ──");
      for (const [label, r] of phases) {
        const errs = r.errors || [];
        if (errs.length === 0) continue;
        console.log(`\n   [${label}] (${errs.length}):`);
        errs.slice(0, ERRORS_PER_PHASE).forEach((line, i) => {
          console.log(`      ${i + 1}. ${line}`);
        });
        if (errs.length > ERRORS_PER_PHASE) {
          console.log(
            `      … ${errs.length - ERRORS_PER_PHASE} more for ${label}`
          );
        }
      }
      console.log("");
    }
  } catch (error) {
    console.error("\n❌ FATAL ERROR:", error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log("🟡 Disconnected from MongoDB.");
    }
  }
}

runAllMigrations();
