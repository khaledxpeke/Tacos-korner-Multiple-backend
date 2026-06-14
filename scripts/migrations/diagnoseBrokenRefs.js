/**
 * Diagnose broken type→ingredient/product refs and product→category refs.
 * Usage: node scripts/migrations/diagnoseBrokenRefs.js
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  await mongoose.connect(process.env.DATABASE_URL);
  const db = mongoose.connection.db;
  console.log("🔍 Broken reference diagnostics\n");

  // ── 1. Types: check ingredient/product refs ──
  const types = await db.collection("types").find({}).toArray();
  let brokenIngredient = 0, brokenProduct = 0, oldFormatTypes = 0;

  for (const type of types) {
    // Detect old format: plain ObjectId array (no .ingredient sub-field)
    const firstIng = (type.ingredients || [])[0];
    if (firstIng && !firstIng.ingredient) {
      oldFormatTypes++;
    }

    for (const ing of type.ingredients || []) {
      const ref = ing.ingredient || ing;
      const found = await db.collection("ingrediants").findOne({ _id: ref });
      if (!found) brokenIngredient++;
    }
    for (const prod of type.products || []) {
      const ref = prod.product || prod;
      const found = await db.collection("products").findOne({ _id: ref });
      if (!found) brokenProduct++;
    }
  }

  console.log(`── Types (${types.length} total) ──`);
  console.log(`  Old format (plain ObjectId, not {ingredient:id}): ${oldFormatTypes}`);
  console.log(`  Broken ingredient refs: ${brokenIngredient}`);
  console.log(`  Broken product refs: ${brokenProduct}`);

  // ── 2. Products: check categories ──
  const products = await db.collection("products").find({}).toArray();
  let noCategories = 0, brokenCategoryRef = 0;

  for (const product of products) {
    const cats = product.categories || [];
    if (cats.length === 0) {
      noCategories++;
      continue;
    }
    for (const catId of cats) {
      const found = await db.collection("categories").findOne({ _id: catId });
      if (!found) brokenCategoryRef++;
    }
  }

  console.log(`\n── Products (${products.length} total) ──`);
  console.log(`  No categories at all: ${noCategories}`);
  console.log(`  Broken category refs: ${brokenCategoryRef}`);

  // ── 3. Sample broken type ──
  if (brokenIngredient > 0 || oldFormatTypes > 0) {
    const sample = types.find((t) => {
      const first = (t.ingredients || [])[0];
      return first && !first.ingredient;
    }) || types.find(t => (t.ingredients || []).length > 0);

    if (sample) {
      console.log(`\n── Sample type (${sample.name}) ──`);
      console.log(`  ingredients[0]:`, JSON.stringify(sample.ingredients?.[0]));
    }
  }

  // ── 4. Sample product with empty categories ──
  if (noCategories > 0) {
    const sample = products.find((p) => (p.categories || []).length === 0);
    console.log(`\n── Sample product with no categories: ${sample?.name} ──`);
  }

  await mongoose.disconnect();
  console.log("\n🟡 Done.");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
