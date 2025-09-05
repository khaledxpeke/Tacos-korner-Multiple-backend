const { ObjectId } = require("mongodb");
const fs = require("fs");
const path = require("path");
const directoryPath = path.join(__dirname, "../data");
const multer = require("multer");

// Import all models
const CarouselMedia = require("../models/carouselMedia");
const Category = require("../models/category");
const Desert = require("../models/desert");
const Drink = require("../models/drink");
const Extra = require("../models/extra");
const History = require("../models/History");
const Ingrediant = require("../models/ingrediant");
const Product = require("../models/product");
const Settings = require("../models/settings");
const StatusHistory = require("../models/statusHistory");
const Type = require("../models/type");
const TypeVariation = require("../models/typeVariations");
const User = require("../models/user");
const Variation = require("../models/variation");

// Map of collections to models
const models = {
  CarouselMedia,
  Category,
  Desert,
  Drink,
  Extra,
  History,
  Ingrediant,
  Product,
  Settings,
  Type,
  TypeVariation,
  User,
  Variation,
};
function updateOids(obj, oidMap) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === "string") {
        // Replace if it's a valid ObjectId in map
        if (/^[0-9a-fA-F]{24}$/.test(obj[i]) && oidMap.has(obj[i])) {
          obj[i] = oidMap.get(obj[i]);
        }
      } else {
        // Recurse into nested objects/arrays
        updateOids(obj[i], oidMap);
      }
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (typeof value === "string") {
      // Replace any ObjectId-looking string if found in map
      if (/^[0-9a-fA-F]{24}$/.test(value) && oidMap.has(value)) {
        obj[key] = oidMap.get(value);
      }
    } else if (Array.isArray(value)) {
      updateOids(value, oidMap);
    } else if (typeof value === "object" && value !== null) {
      updateOids(value, oidMap);
    }
  }
}

// EXPORT function producing two files
exports.exportRestaurantData = async (req, res) => {
  const { restaurantId } = req;
  if (!restaurantId)
    return res
      .status(400)
      .json({ message: "Restaurant ID missing from middleware." });

  try {
    const exportDataRaw = {};
    const exportDataCloned = {};
    const counts = { raw: {}, cloned: {} };

    // Export all collections for raw
    for (const [name, Model] of Object.entries(models)) {
      const query = Model.schema.paths.restaurantId ? { restaurantId } : {};
      const data = await Model.find(query).lean();
      if (data?.length) {
        exportDataRaw[name] = data;
        counts.raw[name] = data.length;
      }
    }
    // For cloned, export all except History
    for (const [name, Model] of Object.entries(models)) {
      if (name === "History") continue;
      if (exportDataRaw[name]) {
        exportDataCloned[name] = exportDataRaw[name];
        counts.cloned[name] = exportDataRaw[name].length;
      }
    }

    if (Object.keys(exportDataRaw).length === 0)
      return res
        .status(404)
        .json({ message: "No data found for this restaurant." });

    // Save files async
    const exportFolder = path.join(__dirname, "../data/exports");
    if (!fs.existsSync(exportFolder))
      fs.mkdirSync(exportFolder, { recursive: true });

    const now = new Date();
    const timestamp = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getFullYear()}`;
    const rawFileName = `restaurant_${restaurantId}_raw_${timestamp}.json`;
    const clonedFileName = `restaurant_${restaurantId}_cloned_${timestamp}.json`;
    const rawFilePath = path.join(exportFolder, rawFileName);
    const clonedFilePath = path.join(exportFolder, clonedFileName);

    await Promise.all([
      fs.promises.writeFile(rawFilePath, JSON.stringify(exportDataRaw, null, 2), "utf-8"),
      fs.promises.writeFile(clonedFilePath, JSON.stringify(exportDataCloned, null, 2), "utf-8"),
    ]);

    const [rawStat, clonedStat] = await Promise.all([
      fs.promises.stat(rawFilePath),
      fs.promises.stat(clonedFilePath),
    ]);

    return res.json({
      success: true,
      message: "Export files generated successfully.",
      files: [
        { type: "raw", filename: rawFileName, size: rawStat.size, docCounts: counts.raw },
        { type: "cloned", filename: clonedFileName, size: clonedStat.size, docCounts: counts.cloned },
      ],
    });
  } catch (err) {
    console.error("Export error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error exporting data", error: err.message });
  }
};

exports.downloadRestaurantExport = async (req, res) => {
  const { restaurantId } = req;
  const { file } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ message: "Restaurant ID missing from middleware." });
  }
  if (!file) {
    return res.status(400).json({ message: "file query parameter is required." });
  }

  // Security: Validate filename pattern is bound to the requesting restaurant
  const safeRegex = new RegExp(`^restaurant_${restaurantId}_(raw|cloned)_\\d{2}-\\d{2}-\\d{4}\\.json$`);
  if (!safeRegex.test(file)) {
    return res.status(403).json({ message: "Invalid or forbidden file name." });
  }

  const exportFolder = path.join(__dirname, "../data/exports");
  const fullPath = path.join(exportFolder, file);

  // Security: Prevent path traversal
  if (path.dirname(fullPath) !== exportFolder) {
    return res.status(400).json({ message: "Invalid path." });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: "File not found." });
  }

  return res.download(fullPath, file, (err) => {
    if (err) {
      console.error("Download error:", err);
      // Cannot send response if headers already sent
    }
  });
};

const imageCollections = {
  Category: "category",
  Product: "product",
  Ingrediant: "ingrediants",
  Extra: "extras",
  Desert: "dessert",
  Drink: "boisson",
  CarouselMedia: "carousel",
};

function copyImageIfExists(imagePath, collectionName, newRestaurantId, uniqueId) {
  if (!imagePath || typeof imagePath !== "string") return null;
  const baseUploadDir = path.join(__dirname, "..", "uploads");
  const subDir = imageCollections[collectionName];
  if (!subDir) return imagePath; // If not mapped, keep original

  const oldImageFullPath = path.join(__dirname, "..", imagePath);
  if (!fs.existsSync(oldImageFullPath)) return imagePath; // If file doesn't exist, keep original

  // Create new unique filename
  const ext = path.extname(imagePath);
  const newFileName = `${newRestaurantId}_${uniqueId}${ext}`;
  const newImageRelPath = path.join("uploads", subDir, newFileName);
  const newImageFullPath = path.join(baseUploadDir, subDir, newFileName);

  // Copy file
  fs.copyFileSync(oldImageFullPath, newImageFullPath);

  return newImageRelPath.replace(/\\/g, "/");
}
// Configure Multer for temporary upload
const upload = multer({ dest: path.join(__dirname, "../data/") });

// IMPORT function using cloned file
exports.importRestaurantData = async (req, res) => {
  const { restaurantId: newRestaurantId } = req;
  if (!newRestaurantId)
    return res.status(400).json({ message: "Target restaurant ID missing." });

  if (!req.file)
    return res.status(400).json({ message: "JSON file is required." });

  const filePath = req.file.path;

  try {
    const jsonData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const oidMap = new Map();
    const insertedCollections = [];

    // First pass: build oidMap for all collections
    for (const [name, Model] of Object.entries(models)) {
      const data = jsonData[name];
      if (!data || data.length === 0) continue;
      data.forEach((doc) => {
        const oldId = doc._id.toString();
        const newId = new ObjectId().toHexString();
        oidMap.set(oldId, newId);
      });
    }

    // Second pass: clone docs, update _id, restaurantId, and references
    for (const [name, Model] of Object.entries(models)) {
      const data = jsonData[name];
      if (!data || data.length === 0) continue;

      const clonedData = data.map((doc) => {
        const newDoc = { ...doc };
        const oldId = newDoc._id.toString();
        newDoc._id = oidMap.get(oldId) || oldId;
        newDoc.restaurantId = newRestaurantId;
        if (newDoc.image) {
          newDoc.image = copyImageIfExists(newDoc.image, name, newRestaurantId,newDoc._id);
        }
        // For CarouselMedia, Restaurant, etc. you may have other image fields (e.g., logo, banner)
        if (name === "CarouselMedia" && newDoc.media) {
          newDoc.media = copyImageIfExists(newDoc.media, name, newRestaurantId, newDoc._id);
        }
        return newDoc;
      });

      // Update all references in the doc to use new IDs
      clonedData.forEach((doc) => updateOids(doc, oidMap));

      try {
        await Model.insertMany(clonedData, { ordered: false });
        insertedCollections.push(name);
      } catch (err) {
        if (err.code === 11000) {
          console.log(`Duplicate keys skipped in collection ${name}`);
          insertedCollections.push(name);
        } else {
          throw err;
        }
      }
    }

    fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: "Import complete",
      insertedCollections,
    });
  } catch (err) {
    console.error("Import error:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Error importing data",
        error: err.message,
      });
  }
};

// Export Multer upload for route
exports.upload = upload.single("file");
