// scripts/diagnostics/checkAllMedia.js
const mongoose = require("mongoose");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

async function checkAllMedia() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log("🔍 Checking ALL Media documents...\n");
  
  const Media = require("../../models/media");
  
  // Get counts by type
  const stats = await Media.aggregate([
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  
  console.log("Media by type:");
  stats.forEach(stat => console.log(`- ${stat._id}: ${stat.count}`));
  
  // Show first 10 docs of each shared type
  const sharedTypes = ["product", "category", "ingredient"];
  
  for (const type of sharedTypes) {
    console.log(`\n--- Sample ${type} documents ---`);
    const docs = await Media.find({ type }).limit(5).lean();
    docs.forEach(doc => {
      console.log(`ID: ${doc._id}`);
      console.log(`URL: ${doc.url}`);
      console.log(`Target: ${doc.targetType} - ${doc.targetId}`);
      console.log("---");
    });
  }
  
  await mongoose.disconnect();
}

checkAllMedia().catch(console.error);