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

const Settings = require("../../models/settings");
const Media = require("../../models/media");
const { getFileHashViaApi } = require("../../utils/migrationUtils");

const DEFAULT_BANNER_PATH = "uploads/default-banner.png";

async function migrateSettingsMedia() {
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

    const settingsList = await mongoose.connection.db.collection("settings").find({
      banner: {
        $type: 2,
        $nin: [DEFAULT_BANNER_PATH, ""],
      },
    }).toArray();

    console.log(`\n--- Starting Migration for ${settingsList.length} Settings ---\n`);

    for (const settings of settingsList) {
      const settingsId = settings._id.toString();
      const restaurantId = settings.restaurantId?.toString();
      const oldRelativePath = settings.banner;
      const type = "banner";
      
      // Pattern: restaurant_xxx/banner/
      const NEW_PATH_PATTERN = /restaurant_[0-9a-f]{24}[\\\/]banner[\\\/]/;

      try {
        // Skip already migrated
        if (NEW_PATH_PATTERN.test(oldRelativePath)) {
          console.warn(`⚠️ Skipping Settings for restaurant ${restaurantId}: Already migrated.`);
          failCount++;
          continue;
        }

        // Skip external URLs
        if (oldRelativePath.startsWith('http')) {
          console.warn(`⚠️ Skipping Settings for restaurant ${restaurantId}: External URL.`);
          failCount++;
          continue;
        }

        // Validate restaurantId
        if (!restaurantId) {
          console.warn(`⚠️ Skipping Settings for restaurant ${restaurantId || 'N/A'}: No restaurantId.`);
          failCount++;
          continue;
        }

        // Build paths
        const correctedRelativePath = oldRelativePath.startsWith("uploads")
          ? oldRelativePath.substring("uploads".length).replace(/^[\\\/]/, "")
          : oldRelativePath;
          
        const oldFullPath = path.join(OLD_BACKEND_PATH_BASE, "uploads", correctedRelativePath);
        const originalFileName = path.basename(oldRelativePath);
        
        // ✅ Simple path: restaurant_xxx/banner/filename.ext
        const newRelativeDir = path.join(`restaurant_${restaurantId}`, "banner");
        const newFullPath = path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir, originalFileName);
        const newRelativeUrl = path.join("uploads", newRelativeDir, originalFileName);

        // Verify file exists
        await fs.stat(oldFullPath);
        console.log(`📂 Settings for restaurant: ${restaurantId}`);
        console.log(`   - 🟢 File found: ${oldFullPath}`);
        console.log(`   - 📄 Filename: ${originalFileName}`);

        const fileBuffer = await fs.readFile(oldFullPath);
        const hashResult = await getFileHashViaApi({
          fileBuffer: fileBuffer,
          originalname: originalFileName,
        });
        const { hash, mimeType, size } = hashResult;
        
        await fs.mkdir(path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir), { recursive: true });
        console.log(`   - 🚀 Destination: ${newFullPath}`);
        
        // Copy file
        await fs.copyFile(oldFullPath, newFullPath);

        // ✅ Create/update Media doc
        let mediaDoc = await Media.findOne({ hash, restaurantId, type, targetId: settings._id });
        if (!mediaDoc) {
          mediaDoc = new Media({
            filename: originalFileName,
            url: newRelativeUrl,
            mimeType,
            size,
            hash,
            type,
            targetType: "Settings",
            targetId: settings._id,
            restaurantId,
            scope: "restaurant",
          });
        } else {
          mediaDoc.filename = originalFileName;
          mediaDoc.url = newRelativeUrl;
          mediaDoc.mimeType = mimeType;
          mediaDoc.size = size;
          mediaDoc.targetType = "Settings";
          mediaDoc.targetId = settings._id;
          mediaDoc.restaurantId = restaurantId;
          mediaDoc.scope = "restaurant";
        }
        await mediaDoc.save();

        // ✅ Update Settings with Media ID
        await Settings.findByIdAndUpdate(settings._id, { $set: { banner: mediaDoc._id } });

        console.log(`✅ Migrated: ${mediaDoc._id}`);
        successCount++;
      } catch (error) {
        const errorDetail = `Settings (ID: ${settingsId}, Restaurant: ${restaurantId}) - Error: ${error.message}`;
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
  migrateSettingsMedia().then((result) => {
    console.log("\nSettings migration completed.");
    console.log(`✅ Success: ${result.successCount} | ❌ Failed: ${result.failCount}`);
    process.exit(0);
  }).catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { migrateSettingsMedia };