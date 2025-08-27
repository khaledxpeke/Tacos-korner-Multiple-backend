const Category = require('../models/category');
const Product = require('../models/product');
const Ingrediant = require('../models/ingrediant');
const Extra = require('../models/extra');
const Dessert = require('../models/desert');
const Drink = require('../models/drink');
const Restaurant = require('../models/restaurant');
const Settings = require('../models/settings');
const path = require('path');
const { getBlurhashFromImage } = require('../utils/blurhash');

// Utility to update hash for a model
async function updateImageHashes(Model, imageField = 'image', hashField = 'imagePreviewHash') {
  const docs = await Model.find({});
  let updated = 0;
  for (const doc of docs) {
    if (doc[imageField] && !doc[hashField]) {
      const imagePath = path.join(__dirname, '..', doc[imageField]);
      try {
        console.log(`[${Model.modelName}] Generating hash for:`, imagePath);
        const hash = await getBlurhashFromImage(imagePath);
        await Model.findByIdAndUpdate(doc._id, { [hashField]: hash });
        updated++;
        console.log(`[${Model.modelName}] Hash updated for ID:`, doc._id);
      } catch (err) {
        console.error(`[${Model.modelName}] Error for ID: ${doc._id} - ${imagePath}`, err.message);
      }
    }
  }
  console.log(`[${Model.modelName}] Total updated:`, updated);
  return updated;
}

// Express handler
exports.generateAllImageHashes = async (req, res) => {
  try {
    const catCount = await updateImageHashes(Category);
    const prodCount = await updateImageHashes(Product);
    const ingCount = await updateImageHashes(Ingrediant);
    const extraCount = await updateImageHashes(Extra);
    const dessertCount = await updateImageHashes(Dessert);
    const drinkCount = await updateImageHashes(Drink);
    const restaurantCount = await updateImageHashes(Restaurant, 'logo');
    const settingsCount = await updateImageHashes(Settings, 'banner');
    res.status(200).json({
      message: 'Image hashes generated',
      categoriesUpdated: catCount,
      productsUpdated: prodCount,
      ingrediantsUpdated: ingCount,
      extrasUpdated: extraCount,
      dessertsUpdated: dessertCount,
      drinksUpdated: drinkCount,
      restaurantsUpdated: restaurantCount,
      settingsUpdated: settingsCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
