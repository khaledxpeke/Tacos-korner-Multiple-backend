const Category = require('../models/category');
const Product = require('../models/product');
const Ingrediant = require('../models/ingrediant');
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
        const hash = await getBlurhashFromImage(imagePath);
        await Model.findByIdAndUpdate(doc._id, { [hashField]: hash });
        updated++;
      } catch (err) {
        // Ignore errors for missing/corrupt images
      }
    }
  }
  return updated;
}

// Express handler
exports.generateAllImageHashes = async (req, res) => {
  try {
    const catCount = await updateImageHashes(Category);
    const prodCount = await updateImageHashes(Product);
    const ingCount = await updateImageHashes(Ingrediant);
    res.status(200).json({
      message: 'Image hashes generated',
      categoriesUpdated: catCount,
      productsUpdated: prodCount,
      ingrediantsUpdated: ingCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
