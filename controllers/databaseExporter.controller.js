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
  StatusHistory,
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
  if (!restaurantId) return res.status(400).json({ message: "Restaurant ID missing from middleware." });

  try {
    const exportDataRaw = {};
    const exportDataCloned = {};
    // Export all collections for raw
    for (const [name, Model] of Object.entries(models)) {
      let query = {};
      if (Model.schema.paths.restaurantId) query.restaurantId = restaurantId;
      const data = await Model.find(query).lean();
      if (!data || data.length === 0) continue;
      exportDataRaw[name] = data;
    }
    // For cloned, export all except History
    for (const [name, Model] of Object.entries(models)) {
      if (name === 'History') continue;
      let query = {};
      if (Model.schema.paths.restaurantId) query.restaurantId = restaurantId;
      const data = await Model.find(query).lean();
      if (!data || data.length === 0) continue;
      exportDataCloned[name] = data;
    }
    if (Object.keys(exportDataRaw).length === 0)
      return res.status(404).json({ message: "No data found for this restaurant." });

    // Save files
    const exportFolder = path.join(__dirname, "../data/exports");
    if (!fs.existsSync(exportFolder)) fs.mkdirSync(exportFolder, { recursive: true });

    const now = new Date();
    const timestamp = `${now.getDate().toString().padStart(2,'0')}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getFullYear()}`;

    const rawFilePath = path.join(exportFolder, `restaurant_${restaurantId}_raw_${timestamp}.json`);
    const clonedFilePath = path.join(exportFolder, `restaurant_${restaurantId}_cloned_${timestamp}.json`);

    fs.writeFileSync(rawFilePath, JSON.stringify(exportDataRaw, null, 2), "utf-8");
    fs.writeFileSync(clonedFilePath, JSON.stringify(exportDataCloned, null, 2), "utf-8");

    return res.json({
      success: true,
      message: "Export complete",
      rawFile: rawFilePath,
      clonedFile: clonedFilePath,
      rawData: exportDataRaw,
      clonedData: exportDataCloned
    });
  } catch (err) {
    console.error("Export error:", err);
    return res.status(500).json({ success: false, message: "Error exporting data", error: err.message });
  }
};

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
      data.forEach(doc => {
        const oldId = doc._id.toString();
        const newId = new ObjectId().toHexString();
        oidMap.set(oldId, newId);
      });
    }

    // Second pass: clone docs, update _id, restaurantId, and references
    for (const [name, Model] of Object.entries(models)) {
      const data = jsonData[name];
      if (!data || data.length === 0) continue;

      const clonedData = data.map(doc => {
        const newDoc = { ...doc };
        const oldId = newDoc._id.toString();
        newDoc._id = oidMap.get(oldId) || oldId;
        newDoc.restaurantId = newRestaurantId;
        return newDoc;
      });

      // Update all references in the doc to use new IDs
      clonedData.forEach(doc => updateOids(doc, oidMap));

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
      insertedCollections
    });
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({ success: false, message: "Error importing data", error: err.message });
  }
};

// Export Multer upload for route
exports.upload = upload.single("file");