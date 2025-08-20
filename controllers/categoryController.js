const Category = require("../models/category");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
const fs = require("fs");
const Ingrediant = require("../models/ingrediant");
const path = require("path");
const Product = require("../models/product");
const { getBlurhashFromImage } = require("../utils/blurhash");

const upload = multer({ storage: multerStorage });
exports.createCategory = async (req, res) => {
  req.uploadTarget = "category";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t('errors.image_upload_failed'),
        error: err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: req.t('product.add_image'),
        error: req.t('errors.image_required'),
      });
    }

    const userId = req.user.user._id;
    const image = `uploads/category/${req.file?.filename}` || "";
    try {
      // Generate blurhash for image
      let imagePreviewHash = null;
      if (image) {
        const imagePath = path.join(__dirname, "..", image);
        imagePreviewHash = await getBlurhashFromImage(imagePath);
      }
      const category = await Category.create({
        createdBy: userId,
        name: req.body.name,
        image,
        imagePreviewHash,
        restaurantId,
      });

      const newCategory = await category.save();
      res
        .status(201)
        .json({ newCategory, message: req.t('category.created') });
    } catch (error) {
      res.status(400).json({
        message: req.t('errors.unknown'),
        error: error.message,
      });
    }
  });
};

exports.getAllCategories = async (req, res) => {
  try {
    const { restaurantId } = req;
    const categories = await Category.find({ restaurantId })
      .sort("position")
      .populate({
        path: "products",
        select:
          "name price image type choice description category outOfStock variations visible imagePreviewHash originalPrice discountValue discountStartDate discountEndDate",
        options: { sort: { position: 1 } },
        populate: [
          {
            path: "type",
            select: "name label message min selection payment max",
          },
          {
            path: "typeVariations",
            populate: [
              {
                path: "typeVariation",
                model: "TypeVariation",
                select: "name label description",
              },
              {
                path: "variations",
                select: "_id price",
                populate: {
                  path: "_id",
                  model: "Variation",
                  select: "name",
                },
              },
            ],
          },
        ],
      });
      const populatedCategories = await Promise.all(
      categories
        .filter((category) =>
          category.products.some((product) => product.visible)
        )
        .map(async (category) => {
          const categoryObj = category.toObject();

          // Just keep existing hash
          categoryObj.imagePreviewHash = categoryObj.imagePreviewHash || null;

          categoryObj.products = await Promise.all(
            category.products
              .filter((product) => product.visible !== false)
              .map(async (product) => {
                const productObj = product.toObject();

                // Just keep existing hash
                productObj.imagePreviewHash = productObj.imagePreviewHash || null;

                // Discount logic using correct model fields
                let now = new Date();
                let hasDiscount = false;
                  if (
                  typeof productObj.discountValue === 'number' &&
                  productObj.discountValue > 0 &&
                  productObj.discountStartDate &&
                  productObj.discountEndDate
                ) {
                  const start = new Date(productObj.discountStartDate);
                  const end = new Date(productObj.discountEndDate);
                  if (now >= start && now <= end) {
                    hasDiscount = true;
                  }
                  hasDiscount = true;
                }
                if (hasDiscount) {
                  productObj.originalPrice = productObj.price;
                  productObj.price = Number((productObj.price - productObj.discountValue).toFixed(2));
                } else {
                  productObj.originalPrice = null;
                }

                if (
                  productObj.typeVariations &&
                  productObj.typeVariations.variations
                ) {
                  const { typeVariation, variations } =
                    productObj.typeVariations;
                  const validVariations = variations.filter(
                    (v) =>
                      v?._id?._id &&
                      v._id?.name &&
                      typeof v._id._id === "object"
                  );
                  if (validVariations?.length > 0) {
                    productObj.typeVariations = {
                      _id: typeVariation._id,
                      name: typeVariation.name,
                      label: typeVariation.label,
                      description: typeVariation.description,
                      variations: validVariations.map((v) => ({
                        _id: v._id._id,
                        name: v._id.name,
                        price: v.price || 0,
                      })),
                    };
                  } else {
                    productObj.typeVariations = null;
                  }
                }

                const typesWithIngredients = await Promise.all(
                  product.type.map(async (type) => {
                    const typeObj = type.toObject();

                    const typeIngredients = await Ingrediant.find({
                      types: type._id,
                      visible: true,
                    }).select("name image price suppPrice outOfStock visible imagePreviewHash");

                    if (typeIngredients.length > 0) {
                      typeObj.ingrediants = typeIngredients.map((ing) => {
                        const basePrice = !type.payment
                          ? ing.suppPrice
                          : ing.price;
                        const priceWithTVA = Number(basePrice.toFixed(2));

                        return {
                          _id: ing._id,
                          name: ing.name,
                          image: ing.image,
                          imagePreviewHash: ing.imagePreviewHash || null,
                          price: priceWithTVA,
                          outOfStock: ing.outOfStock,
                          visible: ing.visible,
                        };
                      });
                      return typeObj;
                    }
                    return null;
                  })
                );

                productObj.type = typesWithIngredients.filter(
                  (type) => type !== null
                );
                return productObj;
              })
          );

          return categoryObj;
        })
    );

    const finalCategories = populatedCategories.filter(
      (cat) => cat.products.length > 0
    );

    res.status(200).json(finalCategories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllCategory = async (req, res) => {
  try {
    const { restaurantId } = req;
    const categories = await Category.find({ restaurantId })
      .populate("products")
      .sort("position");
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// exports.getCategoryById = async (req, res) => {
//   const categoryId = req.params.categoryId;
//   try {
//     const category = await Category.findById(categoryId).populate("products");
//     if (!category) {
//       return res.status(404).json({ message: "Aucun categorie trouvée" });
//     }
//     res.status(200).json(category);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

exports.updateCategory = async (req, res) => {
  const categoryId = req.params.categoryId;
  req.uploadTarget = "category";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: req.t('errors.image_upload_failed') });
    }
    const category = await Category.findOne({ _id: categoryId, restaurantId });
    if (!category) {
      return res.status(404).json({ message: req.t('category.not_found') });
    }
    if (category.image && !category.image.startsWith("uploads/category/")) {
      const oldImagePath = path.join(__dirname, "..", category.image);
      const newImagePath = path.join(
        __dirname,
        "..",
        "uploads",
        "category",
        path.basename(category.image)
      );

      if (fs.existsSync(oldImagePath)) {
        fs.renameSync(oldImagePath, newImagePath);
      }
      category.image = `uploads/category/${path.basename(category.image)}`;
    }

    if (req.file) {
      const image = `uploads/category/${req.file.filename}`;
      const oldImagePath = path.join(__dirname, "..", category.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      category.image = image;
      // Generate new hash for updated image
      const imagePath = path.join(__dirname, "..", image);
      category.imagePreviewHash = await getBlurhashFromImage(imagePath);
    }
    try {
      const updatedcategory = await Category.findOneAndUpdate(
        { _id: categoryId, restaurantId },
        {
          name: req.body.name || category.name,
          image: category.image,
          imagePreviewHash: category.imagePreviewHash,
        },
        { new: true }
      );

      res
        .status(200)
        .json({ updatedcategory, message: req.t('category.updated') });
    } catch (error) {
      res.status(500).json({ message: req.t('errors.unknown') });
    }
  });
};

exports.updatePositions = async (req, res) => {
  try {
    const { positions } = req.body;
    const { categoryId } = req.params;
    const { restaurantId } = req;

    await Promise.all(
      positions.map(async ({ productId, position }) => {
        await Product.findOneAndUpdate(
          { _id: productId, category: categoryId, restaurantId },
          { $set: { position } },
          { new: true }
        );
      })
    );

res.status(200).json({ message: req.t('category.positions_updated') });
  } catch (error) {
    res.status(400).json({
      message: req.t('errors.unknown'),
      error: error.message,
    });
  }
};

exports.updateCategoryPositions = async (req, res) => {
  try {
    const { positions } = req.body;
    const { restaurantId } = req;

    for (const { categoryId, position } of positions) {
      await Category.findOneAndUpdate(
        { _id: categoryId, restaurantId },
        { position },
        { new: true }
      );
    }

    res.status(200).json({ message: req.t('category.positions_updated') });
  } catch (error) {
    res.status(400).json({
      message: req.t('errors.unknown'),
      error: error.message,
    });
  }
};

exports.deleteCategory = async (req, res) => {
  const categoryId = req.params.categoryId;
  const { restaurantId } = req;
  try {
    let category = await Category.findOne({ _id: categoryId, restaurantId });
    if (!category) {
      return res.status(404).json({ message: req.t('category.not_found') });
    }

    await Product.deleteMany({ category: categoryId, restaurantId });
    // Update products to set category to null
    // await Product.updateMany(
    //   { category: categoryId, restaurantId },
    //   { $set: { category: null } }
    // );
    if (category.image) {
      const imagePath = path.join(__dirname, "..", category.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Category.findOneAndDelete({ _id: categoryId, restaurantId });

    res.status(200).json({ message: req.t('category.deleted') });
  } catch (error) {
    res.status(500).json({ message: req.t('errors.unknown') });
  }
};
