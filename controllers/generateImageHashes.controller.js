const Category = require('../models/category');
const Product = require('../models/product');
const Ingrediant = require('../models/ingrediant');
const Extra = require('../models/extra');
const Dessert = require('../models/desert');
const Drink = require('../models/drink');
const Restaurant = require('../models/restaurant');
const Settings = require('../models/settings');


async function removeImageHashes(Model, hashField = 'imagePreviewHash') {
  const result = await Model.updateMany(
    { [hashField]: { $exists: true } },
    { $unset: { [hashField]: "" } },
    { strict: false }
  );
  console.log(`[${Model.modelName}] Hash removed for ${result.modifiedCount || result.nModified} documents`);
  return result.modifiedCount || result.nModified || 0;
}



exports.removeAllImageHashes = async (req, res) => {
  try {
    const catCount = await removeImageHashes(Category);
    const prodCount = await removeImageHashes(Product);
    const ingCount = await removeImageHashes(Ingrediant);
    const extraCount = await removeImageHashes(Extra);
    const dessertCount = await removeImageHashes(Dessert);
    const drinkCount = await removeImageHashes(Drink);
    const restaurantCount = await removeImageHashes(Restaurant, 'imagePreviewHash');
    const settingsCount = await removeImageHashes(Settings, 'imagePreviewHash');
    res.status(200).json({
      message: 'Image hashes removed',
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
