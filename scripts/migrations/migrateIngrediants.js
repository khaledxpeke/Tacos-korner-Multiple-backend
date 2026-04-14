const fs = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const OLD_BACKEND_PATH_BASE = path.join(__dirname, "..", "..");
const NEW_MEDIA_SERVER_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "mediaBackend",
  "uploads"
);

const Ingrediant = require("../../models/ingrediant"); // Note the model name spelling
const Media = require("../../models/media");
const { getFileHashViaApi } = require("../../utils/migrationUtils");

const DEFAULT_PEXELS_URL = "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940 ";

async function migrateIngrediantMedia() {
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  const isConnected = mongoose.connection.readyState === 1;
  let connectionCreated = false;
  
  try {
    if (!isConnected) {
      await mongoose.connect(process.env.DATABASE_URL);
      connectionCreated = true;
      console.log("🟢 Connected to MongoDB.");
    }

    const ingrediants = await mongoose.connection.db.collection("ingrediants").find({
      image: {
        $type: 2,
        $nin: [DEFAULT_PEXELS_URL, ""],
      },
    }).toArray();

    console.log(`\n--- Starting Migration for ${ingrediants.length} Ingredients ---\n`);

    for (const ingrediant of ingrediants) {
      const ingrediantId = ingrediant._id.toString();
      const restaurantId = ingrediant.restaurantId?.toString();
      const oldRelativePath = ingrediant.image;
      const type = "image";
      
      // Pattern: restaurant_xxx/ingredient/
      const NEW_PATH_PATTERN = /restaurant_[0-9a-f]{24}[\\\/]ingredient[\\\/]/;

      try {
        // Skip already migrated
        if (NEW_PATH_PATTERN.test(oldRelativePath)) {
          console.warn(`⚠️ Skipping Ingredient "${ingrediant.name}": Already migrated.`);
          failCount++;
          continue;
        }

        // Skip external URLs
        if (oldRelativePath.startsWith('http')) {
          console.warn(`⚠️ Skipping Ingredient "${ingrediant.name}": External URL.`);
          failCount++;
          continue;
        }

        // Validate restaurantId
        if (!restaurantId) {
          console.warn(`⚠️ Skipping Ingredient "${ingrediant.name}": No restaurantId.`);
          failCount++;
          continue;
        }

        // Build paths
        const correctedRelativePath = oldRelativePath.startsWith("uploads")
          ? oldRelativePath.substring("uploads".length).replace(/^[\\\/]/, "")
          : oldRelativePath;
          
        const oldFullPath = path.join(OLD_BACKEND_PATH_BASE, "uploads", correctedRelativePath);
        const originalFileName = path.basename(oldRelativePath);
        
        // ✅ Simple path: restaurant_xxx/ingredient/filename.ext
        const newRelativeDir = path.join(`restaurant_${restaurantId}`, "ingredient");
        const newFullPath = path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir, originalFileName);
        const newRelativeUrl = path.join("uploads", newRelativeDir, originalFileName);

        // Verify file exists
        await fs.stat(oldFullPath);
        console.log(`📂 Ingredient: ${ingrediant.name}`);
        console.log(`   - 🟢 File found: ${oldFullPath}`);

        const fileBuffer = await fs.readFile(oldFullPath);
        const hashResult = await getFileHashViaApi({
          fileBuffer: fileBuffer,
          originalname: originalFileName,
        });
        const { hash, mimeType, size } = hashResult;
        
        await fs.mkdir(path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir), { recursive: true });
        console.log(`   - 🚀 Destination: ${newFullPath}`);
        await fs.copyFile(oldFullPath, newFullPath);

        // Create/update Media doc
        let mediaDoc = await Media.findOne({ hash, restaurantId, type, targetId: ingrediant._id });
        if (!mediaDoc) {
          mediaDoc = new Media({
            filename: originalFileName,
            url: newRelativeUrl,
            mimeType,
            size,
            hash,
            type,
            targetType: "Ingrediant",
            targetId: ingrediant._id,
            restaurantId,
            scope: "shared",
          });
        } else {
          mediaDoc.filename = originalFileName;
          mediaDoc.url = newRelativeUrl;
          mediaDoc.mimeType = mimeType;
          mediaDoc.size = size;
          mediaDoc.targetType = "Ingrediant";
          mediaDoc.targetId = ingrediant._id;
          mediaDoc.restaurantId = restaurantId;
          mediaDoc.scope = "shared";
        }
        await mediaDoc.save();

        // Update Ingredient
        await Ingrediant.findByIdAndUpdate(ingrediant._id, { $set: { image: mediaDoc._id } });

        console.log(`✅ Migrated: ${mediaDoc._id}`);
        successCount++;
      } catch (error) {
        const errorDetail = `Ingrediant: ${ingrediant.name} (ID: ${ingrediantId}) - Error: ${error.message}`;
        console.error(`❌ FAILED: ${error.message}`);
        errors.push(errorDetail);
        failCount++;
      }
    }

    return { successCount, failCount, errors };
  } finally {
    if (connectionCreated && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log("🟡 Disconnected from MongoDB.");
    }
  }
}

// Run if called directly
if (require.main === module) {
  migrateIngrediantMedia().then((result) => {
    console.log("\nIngredient migration completed.");
    console.log(`✅ Success: ${result.successCount} | ❌ Failed: ${result.failCount}`);
    process.exit(0);
  }).catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { migrateIngrediantMedia };