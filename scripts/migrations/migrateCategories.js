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

const Category = require("../../models/category");
const Media = require("../../models/media");
const { getFileHashViaApi } = require("../../utils/migrationUtils");

const DEFAULT_PEXELS_URL = "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940 ";

async function migrateCategoryMedia() {
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

    const categories = await mongoose.connection.db.collection("categories").find({
      image: {
        $type: 2,
        $nin: [DEFAULT_PEXELS_URL, ""],
      },
    }).toArray();

    console.log(`\n--- Starting Migration for ${categories.length} Categories ---\n`);

    for (const category of categories) {
      const categoryId = category._id.toString();
      const restaurantId = category.restaurantId?.toString();
      const type = "image";
      const oldRelativePath = category.image;
      
      // Pattern: restaurant_xxx/category/yyy/image/
        const NEW_PATH_PATTERN = /restaurant_[0-9a-f]{24}[\\\/]category[\\\/]/;

      try {
        // Skip already migrated
        if (NEW_PATH_PATTERN.test(oldRelativePath)) {
          console.warn(`⚠️ Skipping "${category.name}": Already migrated.`);
          failCount++;
          continue;
        }

        // Skip external URLs
        if (oldRelativePath.startsWith('http')) {
          console.warn(`⚠️ Skipping "${category.name}": External URL.`);
          failCount++;
          continue;
        }

        // Validate restaurantId
        if (!restaurantId) {
          console.warn(`⚠️ Skipping "${category.name}": No restaurantId.`);
          failCount++;
          continue;
        }

        // Build paths
        const correctedRelativePath = oldRelativePath.startsWith("uploads")
          ? oldRelativePath.substring("uploads".length).replace(/^[\\\/]/, "")
          : oldRelativePath;
          
        const oldFullPath = path.join(OLD_BACKEND_PATH_BASE, "uploads", correctedRelativePath);
        const oldFileName = path.basename(oldRelativePath);
        const newRelativeDir = path.join(`restaurant_${restaurantId}`, "category");
        const newFullPath = path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir, oldFileName);
        const newRelativeUrl = path.join("uploads", newRelativeDir, oldFileName);
        await fs.stat(oldFullPath);
        console.log(`📂 Category: ${category.name}`);
        console.log(`   - 🟢 File found: ${oldFullPath}`);

        const fileBuffer = await fs.readFile(oldFullPath);
        const hashResult = await getFileHashViaApi({
          fileBuffer: fileBuffer,
          originalname: oldFileName,
        });
        const { hash, mimeType, size } = hashResult;
        
        await fs.mkdir(path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir), { recursive: true });
        console.log(`   - 🚀 Destination: ${newFullPath}`);
        await fs.copyFile(oldFullPath, newFullPath);

        // Create/update Media doc
        let mediaDoc = await Media.findOne({ hash, restaurantId, type: "image", targetId: category._id });
        if (!mediaDoc) {
          mediaDoc = new Media({
            filename: oldFileName,
            url: newRelativeUrl,
            mimeType,
            size,
            hash,
            type: "image",
            targetType: "Category",
            targetId: category._id,
            restaurantId,
            scope: "shared",
          });
        } else {
          mediaDoc.filename = oldFileName;
          mediaDoc.url = newRelativeUrl;
          mediaDoc.mimeType = mimeType;
          mediaDoc.size = size;
          mediaDoc.targetType = "Category";
          mediaDoc.targetId = category._id;
          mediaDoc.restaurantId = restaurantId;
          mediaDoc.scope = "shared";
        }
        await mediaDoc.save();

        // Update Category
        await Category.findByIdAndUpdate(category._id, { $set: { image: mediaDoc._id } });

        console.log(`✅ Migrated: ${mediaDoc._id}`);
        successCount++;
      } catch (error) {
        const errorDetail = `Category: ${category.name} (ID: ${categoryId}) - Error: ${error.message}`;
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
  migrateCategoryMedia().then(() => {
    console.log("Category migration completed.");
    process.exit(0);
  }).catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { migrateCategoryMedia };