/**
 * Quick raw DB inspection — shows exactly what's stored for the first 5
 * categories and products, and what their linked Media URL is (if any).
 *
 * Usage: node scripts/migrations/inspectRawImageFields.js
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

async function inspect(collectionName, imageField = "image") {
  const docs = await mongoose.connection.db
    .collection(collectionName)
    .find({})
    .limit(6)
    .toArray();

  console.log(`\n── ${collectionName} (first ${docs.length}) ──`);

  for (const doc of docs) {
    const raw = doc[imageField];
    const type = raw === null || raw === undefined
      ? "null/undefined"
      : mongoose.Types.ObjectId.isValid(raw) && typeof raw !== "string"
        ? "ObjectId"
        : typeof raw;

    let mediaUrl = null;
    if (type === "ObjectId") {
      const media = await mongoose.connection.db
        .collection("media")
        .findOne({ _id: raw }, { projection: { url: 1 } });
      mediaUrl = media ? media.url : "⚠️ Media doc NOT found";
    }

    console.log(`  [${doc.name || doc._id}]`);
    console.log(`    ${imageField} type: ${type}`);
    console.log(`    ${imageField} value: ${String(raw).slice(0, 100)}`);
    if (mediaUrl !== null) {
      console.log(`    → Media.url: ${mediaUrl}`);
    }
  }
}

async function main() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log("🔍 Raw DB inspection\n");

  await inspect("categories");
  await inspect("products");
  await inspect("ingrediants");
  await inspect("allergies", "icon");

  console.log("\n── media collection: sample urls ──");
  const mediaSample = await mongoose.connection.db
    .collection("media")
    .find({})
    .limit(10)
    .toArray();
  mediaSample.forEach((m) =>
    console.log(`  [${m.type}] ${m.url}`)
  );

  await mongoose.disconnect();
  console.log("\n🟡 Done.");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
