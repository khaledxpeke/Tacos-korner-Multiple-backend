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

const Restaurant = require("../../models/restaurant");
const Media = require("../../models/media");
const { getFileHashViaApi } = require("../../utils/migrationUtils");

async function migrateRestaurantMedia() {
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

    const restaurants = await mongoose.connection.db
      .collection("restaurants")
      .find({
        logo: { $type: 2, $ne: "" },
      })
      .toArray();
    console.log(
      `\n--- Starting Migration for ${restaurants.length} Restaurants ---\n`
    );

    for (const restaurant of restaurants) {
      const restaurantId = restaurant._id.toString();
      const type = "logo";
      const oldRelativePath = restaurant.logo;
      const NEW_PATH_PATTERN = /restaurant_[0-9a-f]{24}[\\\/]logo[\\\/]/;

      const correctedRelativePath = oldRelativePath.startsWith("uploads")
        ? oldRelativePath.substring("uploads".length).replace(/^[\\\/]/, "")
        : oldRelativePath;
      const oldFullPath = path.join(
        OLD_BACKEND_PATH_BASE,
        "uploads",
        correctedRelativePath
      );

      const oldFileName = path.basename(oldRelativePath);
      const newRelativeDir = path.join(`restaurant_${restaurantId}`, type);
      const newFullPath = path.join(
        NEW_MEDIA_SERVER_PATH,
        newRelativeDir,
        oldFileName
      );
      const newRelativeUrl = path.join("uploads", newRelativeDir, oldFileName);

      try {
        if (NEW_PATH_PATTERN.test(oldRelativePath)) {
          console.warn(
            `⚠️ Skipping ${restaurant.name}: Path already in NEW format (${oldRelativePath}). Clearing logo field.`
          );
          await Restaurant.findByIdAndUpdate(restaurant._id, {
            $set: { logo: null },
          });
          failCount++;
          continue;
        }
        await fs.stat(oldFullPath);
        console.log(`   - 🟢 File found. Path: ${oldFullPath}`);
        const fileBuffer = await fs.readFile(oldFullPath);

        const hashResult = await getFileHashViaApi({
          fileBuffer: fileBuffer,
          originalname: oldFileName,
        });
        const { hash, mimeType, size } = hashResult;
        await fs.mkdir(path.join(NEW_MEDIA_SERVER_PATH, newRelativeDir), {
          recursive: true,
        });
        console.log(`   - 🚀 Destination Path: ${newFullPath}`);
        await fs.copyFile(oldFullPath, newFullPath);

        let mediaDoc = await Media.findOne({ hash, restaurantId, type });
        if (!mediaDoc) {
          mediaDoc = new Media({
            filename: oldFileName,
            url: newRelativeUrl,
            mimeType,
            size,
            hash,
            type,
            targetType: "Restaurant",
            targetId: restaurant._id,
            restaurantId,
            scope: "restaurant",
          });
        } else {
          mediaDoc.filename = oldFileName;
          mediaDoc.url = newRelativeUrl;
          mediaDoc.mimeType = mimeType;
          mediaDoc.size = size;
          mediaDoc.targetType = "Restaurant";
          mediaDoc.targetId = restaurant._id;
          mediaDoc.scope = "restaurant";
        }
        await mediaDoc.save();

        await Restaurant.findByIdAndUpdate(
          restaurant._id,
          {
            $set: { logo: mediaDoc._id },
          },
          { new: true }
        );

        console.log(
          `✅ Restaurant ${restaurant.name} (${restaurantId}) logo migrated, ID written to 'logo': ${mediaDoc._id}`
        );
        successCount++;
      } catch (error) {
        const errorDetail = `Restaurant: ${restaurant.name} (ID: ${restaurantId}) - Error: ${error.message}`;
        console.error(`❌ Migration FAILED: ${error.message}`);
        errors.push(errorDetail);
        failCount++;
      }
    }

    return { successCount, failCount, errors };
  } catch (globalError) {
    console.error(
      "\n❌ CRITICAL ERROR: Database or Global Failure:",
      globalError.message
    );
    errors.push(`CRITICAL: ${globalError.message}`);
    return { successCount, failCount, errors };
  } finally {
    if (connectionCreated && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log("\n🟡 Disconnected from MongoDB.");
    }

    console.log("\n==============================================");
    console.log("         ✨ MIGRATION SUMMARY REPORT ✨       ");
    console.log("==============================================");
    console.log(`🟢 Total Migrated Successfully: ${successCount}`);
    console.log(`❌ Total Failed: ${failCount}`);
    console.log("==============================================\n");
  }
}

if (require.main === module) {
  migrateRestaurantMedia()
    .then(() => {
      console.log("Restaurant migration completed.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}

module.exports = { migrateRestaurantMedia };
