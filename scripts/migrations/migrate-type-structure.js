const Type = require("../../models/type"); // adjust path if needed
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const mongoose = require("mongoose");

const APPLY_CHANGES = process.argv.includes("--apply"); // 🧠 only apply if --apply is passed

(async () => {
  try {
    if (!process.env.DATABASE_URL) {
      console.error("ERROR: DATABASE_URL not set.");
      process.exit(1);
    }

    await mongoose.connect(process.env.DATABASE_URL, {
      autoIndex: false,
    });
    console.log(
      `✅ Connected to DB — Mode: ${APPLY_CHANGES ? "APPLY" : "DRY-RUN"}`
    );

    const types = await Type.find({});
    console.log(`Found ${types.length} types\n`);

    let toMigrateCount = 0;

    for (const type of types) {
      let updated = false;

      if (
        Array.isArray(type.ingredients) &&
        type.ingredients.length > 0 &&
        type.ingredients[0] &&
        !type.ingredients[0].ingredient 
      ) {
        console.log(`🔸 [${type.name}] ingredients need migration`);
        type.ingredients = type.ingredients.map((id, index) => ({
          ingredient: id,
          position: index,
        }));
        updated = true;
      }

      if (
        Array.isArray(type.products) &&
        type.products.length > 0 &&
        type.products[0] &&
        !type.products[0].product 
      ) {
        console.log(`🔸 [${type.name}] products need migration`);
        type.products = type.products.map((id, index) => ({
          product: id,
          position: index,
        }));
        updated = true;
      }

      if (updated) {
        if (type.mode === "INGREDIENT") type.mode = "INGREDIENTS";
        if (type.mode === "PRODUCT") type.mode = "PRODUCTS";
        toMigrateCount++;
        if (APPLY_CHANGES) {
          await type.save();
          console.log(`✅ Migrated type: ${type.name}`);
        } else {
          console.log(`🧾 Would migrate type: ${type.name}`);
        }
      }
    }

    console.log(
      `\n${
        APPLY_CHANGES ? "✅ Migration complete" : "🧪 Dry-run complete"
      } — ${toMigrateCount} types affected`
    );

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed", err);
    process.exit(1);
  }
})();
