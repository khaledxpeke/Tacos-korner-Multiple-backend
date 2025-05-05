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

const upload = multer({ storage: multerStorage });
exports.createCategory = async (req, res) => {
  req.uploadTarget = "category";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: "Le téléchargement de l'image a échoué",
        error: err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: "Ajouter une image",
        error: "Veuillez télécharger une image",
      });
    }

    const userId = req.user.user._id;
    const image = `uploads/category/${req.file?.filename}` || "";
    try {
      const category = await Category.create({
        createdBy: userId,
        name: req.body.name,
        image,
        restaurantId,
      });

      const newCategory = await category.save();
      res
        .status(201)
        .json({ newCategory, message: "categorie créer avec succées" });
    } catch (error) {
      res.status(400).json({
        message: "Some error occured",
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
          "name price image type choice description category outOfStock variations visible",
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

          categoryObj.products = await Promise.all(
            category.products
              .filter((product) => product.visible !== false)
              .map(async (product) => {
                const productObj = product.toObject();

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
                // productObj.variations = productObj.variations.map(v => ({
                //   _id: v._id._id,
                //   name: v._id.name,
                //   price: v.price
                // }));
                const typesWithIngredients = await Promise.all(
                  product.type.map(async (type) => {
                    const typeObj = type.toObject();

                    const typeIngredients = await Ingrediant.find({
                      types: type._id,
                      visible: true,
                    }).select("name image price suppPrice outOfStock visible");
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
      return res.status(500).json({ message: "Probleme image" });
    }
    const category = await Category.findOne({ _id: categoryId, restaurantId });
    if (!category) {
      return res.status(404).json({ message: "Aucun Categorie trouvée" });
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
    }
    try {
      const updatedcategory = await Category.findOneAndUpdate(
        { _id: categoryId, restaurantId },
        {
          name: req.body.name || category.name,
          image: category.image,
        },
        { new: true }
      );

      res
        .status(200)
        .json({ updatedcategory, message: "Categorie modifié avec succées" });
    } catch (error) {
      res.status(500).json({ message: error.message });
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

    res.status(200).json({ message: "Positions updated successfully" });
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
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

    res.status(200).json({ message: "Positions updated successfully" });
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
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
      return res.status(404).json({ message: "Aucun Categorie trouvée" });
    }
    // Update products to set category to null
    await Product.updateMany(
      { category: categoryId, restaurantId },
      { $set: { category: null } }
    );
    if (category.image) {
      const imagePath = path.join(__dirname, "..", category.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Category.findOneAndDelete({ _id: categoryId, restaurantId });

    res.status(200).json({ message: "categorie supprimée avec succées" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
