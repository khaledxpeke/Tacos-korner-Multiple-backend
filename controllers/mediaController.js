const Product = require("../models/product");
const Category = require("../models/category");
const fs = require("fs");
const path = require("path");

exports.getLargestMedia = async (req, res) => {
  try {
    const products = await Product.find({}, "image");
    const categories = await Category.find({}, "image");

    const images = [
      ...products.map((p) => ({ path: p.image })),
      ...categories.map((c) => ({ path: c.image })),
    ].filter((img) => img.path);

    // Get file sizes
    const mediaStats = images
      .map((img) => {
        const filePath = path.join(__dirname, "..", img.path);
        try {
          const stats = fs.statSync(filePath);
          return {
            name: img.path,
            size: stats.size,
          };
        } catch (err) {
          return null;
        }
      })
      .filter((stat) => stat !== null);

    // Sort by size and get top 50
    const largestFiles = mediaStats
      .sort((a, b) => b.size - a.size)
      .slice(0, 50)
      .map((file) => file.name);

    res.status(200).json(largestFiles);
  } catch (error) {
    res.status(500).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};
