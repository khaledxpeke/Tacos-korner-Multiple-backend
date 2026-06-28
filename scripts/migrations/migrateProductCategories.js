/**
 * Copy legacy product.category → categories[] and remove category field.
 *
 * The HTTP migrate endpoint previously used Mongoose .save(), which cannot read
 * `category` because it is no longer on the Product schema — it wrote empty arrays.
 *
 * Usage:
 *   node scripts/migrations/migrateProductCategories.js           # dry-run
 *   node scripts/migrations/migrateProductCategories.js --apply   # write to DB
 *
 * Optional:
 *   RESTAURANT_ID=<ObjectId> node scripts/migrations/migrateProductCategories.js --apply
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const APPLY = process.argv.includes("--apply");
const RESTAURANT_ID = process.env.RESTAURANT_ID || null;

async function main() {
  await mongoose.connect(process.env.DATABASE_URL);
  const collection = mongoose.connection.db.collection("products");

  const filter = {
    category: { $exists: true, $ne: null, $ne: "" },
    $or: [
      { categories: { $exists: false } },
      { categories: null },
      { categories: { $size: 0 } },
    ],
  };

  if (RESTAURANT_ID) {
    filter.restaurantId = new mongoose.Types.ObjectId(RESTAURANT_ID);
    console.log(`Scope: restaurantId=${RESTAURANT_ID}`);
  } else {
    console.log("Scope: all restaurants");
  }

  const sample = await collection.find(filter).limit(5).toArray();
  console.log(`\nWould migrate ${await collection.countDocuments(filter)} product(s)`);
  console.log("Sample:\n");
  sample.forEach((doc) => {
    console.log(`  ${doc.name}: category=${doc.category} categories=${JSON.stringify(doc.categories)}`);
  });

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write changes.");
    await mongoose.disconnect();
    return;
  }

  const result = await collection.updateMany(filter, [
    {
      $set: {
        categories: {
          $cond: {
            if: { $ne: ["$category", null] },
            then: {
              $cond: {
                if: { $eq: [{ $type: "$category" }, "string"] },
                then: [{ $toObjectId: "$category" }],
                else: [{ $category }],
              },
            },
            else: [],
          },
        },
      },
    },
    { $unset: "category" },
  ]);

  console.log(`\nDone. matched=${result.matchedCount} modified=${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
