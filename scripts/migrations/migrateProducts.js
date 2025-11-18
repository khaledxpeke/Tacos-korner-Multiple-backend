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

const Product = require("../../models/product");
const Media = require("../../models/media");
const { getFileHashViaApi } = require("../../utils/migrationUtils");

const DEFAULT_PEXELS_URL = "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940 ";

async function migrateProductMedia() {
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

    const products = await mongoose.connection.db.collection('products').find({
      image: { 
        $type: 2, // string type
        $ne: DEFAULT_PEXELS_URL,
        $ne: ""
      }
    }).toArray();

    console.log(`\n--- Starting Migration for ${products.length} Products ---\n`);

    for (const product of products) {
      const productId = product._id.toString();
      const restaurantId = product.restaurantId?.toString();
      const oldRelativePath = product.image;
      const type = "image";
      
      // Pattern: restaurant_xxx/product/filename.ext
      const NEW_PATH_PATTERN = /restaurant_[0-9a-f]{24}[\\\/]product[\\\/]/;

      try {
        // Skip already migrated
        if (NEW_PATH_PATTERN.test(oldRelativePath)) {
          console.warn(`⚠️ Skipping Product "${product.name}": Already migrated.`);
          failCount++;
          continue;
        }

        // Skip external URLs
        if (oldRelativePath.startsWith('http')) {
          console.warn(`⚠️ Skipping Product "${product.name}": External URL.`);
          failCount++;
          continue;
        }

        // Validate restaurantId
        if (!restaurantId) {
          console.warn(`⚠️ Skipping Product "${product.name}": No restaurantId.`);
          failCount++;
          continue;
        }

        // Build paths
        const correctedRelativePath = oldRelativePath.startsWith("uploads")
          ? oldRelativePath.substring("uploads".length).replace(/^[\\\/]/, "")
          : oldRelativePath;
          
        const oldFullPath = path.join(OLD_BACKEND_PATH_BASE, "uploads", correctedRelativePath);
        const originalFileName = path.basename(oldRelativePath);
        
        // ✅ Simple path: restaurant_xxx/product/filename.ext
        const newRelativeDir = path.join(`restaurant_${restaurantId}`, "product");
        const newFullPath = path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir, originalFileName);
        const newRelativeUrl = path.join("uploads", newRelativeDir, originalFileName);

        // Verify file exists
        await fs.stat(oldFullPath);
        console.log(`📂 Product: ${product.name}`);
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
        let mediaDoc = await Media.findOne({ hash, restaurantId, type, targetId: product._id });
        if (!mediaDoc) {
          mediaDoc = new Media({
            filename: originalFileName,
            url: newRelativeUrl,
            mimeType,
            size,
            hash,
            type,
            targetType: "Product",
            targetId: product._id,
            restaurantId,
          });
        } else {
          mediaDoc.filename = originalFileName;
          mediaDoc.url = newRelativeUrl;
          mediaDoc.mimeType = mimeType;
          mediaDoc.size = size;
          mediaDoc.targetType = "Product";
          mediaDoc.targetId = product._id;
          mediaDoc.restaurantId = restaurantId;
        }
        await mediaDoc.save();

        // Update Product
        await Product.findByIdAndUpdate(product._id, { $set: { image: mediaDoc._id } });

        console.log(`✅ Migrated: ${mediaDoc._id}`);
        successCount++;
      } catch (error) {
        const errorDetail = `Product: ${product.name} (ID: ${productId}) - Error: ${error.message}`;
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
  migrateProductMedia().then((result) => {
    console.log("\nProduct migration completed.");
    console.log(`✅ Success: ${result.successCount} | ❌ Failed: ${result.failCount}`);
    process.exit(0);
  }).catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { migrateProductMedia };