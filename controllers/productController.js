const Product = require("../models/product");
const Category = require("../models/category");
const Ingrediant = require("../models/ingrediant");
const express = require("express");
const app = express();
require("dotenv").config();
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
app.use(express.json());
const upload = multer({ storage: multerStorage });
const fs = require("fs");
const path = require("path");
const Settings = require("../models/settings");
const Restaurant = require("../models/restaurant");

exports.addProductToCategory = async (req, res, next) => {
  req.uploadTarget = "product";
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

    const { categoryId } = req.params;
    const userId = req.user.user._id;
    const price = Number(req.body.price ?? "");
    const name = req.body.name.replace(/"/g, "");
    const image = `uploads/product/${req.file?.filename}` || "";
    const {
      choice,
      description,
      outOfStock,
      visible,
      typeVariation,
      variations,
    } = req.body;
    const typeIds = req.body.type || [];
    try {
      let typeVariationsData = null;
      let product = await Product.findOne({ name: name, restaurantId });

      if (product) {
        return res.status(400).json({
          message: "Produit existe déja",
        });
      } else {
        if (typeVariation && variations) {
          const parsedVariations = Array.isArray(variations)
            ? variations
            : JSON.parse(variations);
          typeVariationsData = {
            typeVariation: typeVariation,
            variations: parsedVariations.map((v) => ({
              _id: v._id,
              price: v.price || 0,
            })),
          };
        }
        const parsedTypeIds = Array.isArray(typeIds)
          ? typeIds
          : JSON.parse(typeIds);
        const product = new Product({
          name,
          description,
          price,
          category: categoryId,
          outOfStock,
          visible,
          type: parsedTypeIds,
          typeVariations: typeVariationsData,
          createdBy: userId,
          choice,
          restaurantId,
        });
        if (image) {
          product.image = image;
          await product.save();
        }

        const savedProduct = await product.save();

        const updatedCategory = await Category.findOneAndUpdate(
          { _id: categoryId, restaurantId },
          { $push: { products: savedProduct._id } },
          { new: true }
        );

        res.status(201).json({
          product: savedProduct,
          category: updatedCategory,
          message: "Produit ajouté avec succées",
        });
      }
    } catch (error) {
      res.status(400).json({
        message: "Une erreur s'est produite",
        error: error.message,
      });
    }
  });
};

exports.getProductsByCategory = async (req, res, next) => {
  const { categoryId } = req.params;
  const { restaurantId } = req;

  try {
    const products = await Product.find({ category: categoryId, restaurantId })
      .populate({
        path: "type",
        select: "name",
      })
      .sort({ position: 1 });

    res.status(200).json(products);
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};
exports.getAllProducts = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const products = await Product.find({ restaurantId }).populate([
      {
        path: "type",
        select: "name",
      },
    ]);
    res.status(200).json(products);
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};

exports.getProductData = async (req, res) => {
  try {
    const { productId, variationId } = req.params;
    const { restaurantId } = req;
    const restaurant = await Restaurant.findOne({
      _id: restaurantId,
    }).populate("settings");
    const settings = await Settings.findOne({
      _id: restaurant.settings,
      restaurantId,
    });
    const tva = settings?.tva || 0;
    const product = await Product.findOne({
      _id: productId,
      restaurantId: restaurantId,
    })
      .populate({
        path: "type",
        select: "name message payment selection max min",
      })
      .populate({
        path: "typeVariations.typeVariation",
        model: "TypeVariation",
        select: "name label description",
      })
      .populate("typeVariations.variations._id", "name")
      .lean();

    if (!product) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    if (product.typeVariations) {
      const { typeVariation, variations } = product.typeVariations;
      product.typeVariations = {
        _id: typeVariation._id,
        name: typeVariation.name,
        label: typeVariation.label,
        description: typeVariation.description,
        variations: variations.map((v) => ({
          _id: v._id._id,
          name: v._id.name,
          price: v.price,
        })),
      };
    }

    const typesWithIngredients = await Promise.all(
      product.type.map(async (type) => {
        const typeIngredients = await Ingrediant.find({
          types: type._id,
          visible: true,
          restaurantId,
        })
          .populate({
            path: "variations",
            model: "Variation",
            select: "name price",
          })
          .select("name image price outOfStock visible")
          .lean();

        if (typeIngredients.length > 0) {
          return {
            ...type,
            ingrediants: typeIngredients.map((ing) => {
              const variation = ing.variations?.find(
                (v) => v._id.toString() === variationId
              );
              const basePrice = !type.payment ? ing.suppPrice : ing.price;
              const price = variation ? variation.price : basePrice;

              return {
                _id: ing._id,
                name: ing.name,
                image: ing.image,
                price: price,
                outOfStock: ing.outOfStock,
                visible: ing.visible,
              };
            }),
          };
        }
        return null;
      })
    );

    // const selectedVariation = product.typeVariations.variations.find(
    //   v => v._id._id.toString() === variationId
    // );
    // product.price = selectedVariation ? selectedVariation.price+product.price : product.price;

    const finalPrice = Number(product.price);

    res.status(200).json({
      ...product,
      price: finalPrice,
      type: typesWithIngredients.filter((t) => t !== null),
    });
  } catch (error) {
    res.status(500).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};
exports.deleteProduct = async (req, res, next) => {
  const productId = req.params.productId;
  const { restaurantId } = req;
  try {
    const product = await Product.findOne({ _id: productId, restaurantId });
    if (!product) {
      return res.status(404).json({ message: "Aucun produit trouvé" });
    }
    if (product.image) {
      const imagePath = path.join(__dirname, "..", product.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Product.findOneAndDelete({ _id: productId, restaurantId });
    await Category.updateMany(
      { products: productId, restaurantId },
      { $pull: { products: productId } }
    );
    await Ingrediant.updateMany(
      { product: productId, restaurantId },
      { $pull: { product: productId } }
    );
    res.status(200).json({ message: "Product supprimer avec succées" });
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};

exports.updateProduct = async (req, res) => {
  const productId = req.params.productId;
  const { restaurantId } = req;
  req.uploadTarget = "product";
  upload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: "Le téléchargement de l'image a échoué",
        error: err.message,
      });
    }
    const {
      name,
      price,
      description,
      outOfStock,
      visible,
      supplements,
      ingrediants,
      category,
      choice,
      type,
      typeVariation,
      variations,
    } = req.body;

    try {
      let typeVariationsData = null;
      const product = await Product.findOne({ _id: productId, restaurantId });
      if (!product) {
        return res.status(404).json({ message: "Produit non trouvé" });
      }

      if (category && category !== product.category.toString()) {
        await Category.findOneAndUpdate(
          { _id: product.category, restaurantId },
          {
            $pull: { products: product._id },
          }
        );

        await Category.findOneAndUpdate(
          { _id: category, restaurantId },
          {
            $push: { products: product._id },
          }
        );

        product.category = category;
      }
      if (typeVariation !== undefined || variations !== undefined) {
        if (!typeVariation && (!variations || variations.length === 0)) {
          product.typeVariations = undefined;
          await product.save();
        } else if (typeVariation && variations) {
          const parsedVariations = Array.isArray(variations)
            ? variations
            : JSON.parse(variations);
          typeVariationsData = {
            typeVariation: typeVariation,
            variations: parsedVariations.map((v) => ({
              _id: v._id,
              price: v.price || 0,
            })),
          };
        }
      }
      if (product.image && !product.image.startsWith("uploads/product/")) {
        const oldImagePath = path.join(__dirname, "..", product.image);
        const newImagePath = path.join(
          __dirname,
          "..",
          "uploads",
          "product",
          path.basename(product.image)
        );

        if (fs.existsSync(oldImagePath)) {
          fs.renameSync(oldImagePath, newImagePath);
        }
        product.image = `uploads/product/${path.basename(product.image)}`;
      }

      if (req.file) {
        const image = `uploads/product/${req.file.filename}`;
        const oldImagePath = path.join(__dirname, "..", product.image);

        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }

        product.image = image;
      }

      product.name = name || product.name;
      product.description =
        description !== undefined ? description : product.description;
      product.outOfStock = outOfStock || product.outOfStock;
      product.visible = visible || product.visible;
      product.price = price || product.price;
      product.choice = choice || product.choice;

      product.supplements = supplements ? supplements.split(",") : [];

      product.ingrediants = ingrediants ? ingrediants.split(",") : [];
      product.type = type ? type.split(",") : [];
      product.typeVariations = typeVariationsData || product.typeVariations;

      const updatedProduct = await product.save();

      res
        .status(200)
        .json({ updatedProduct, message: "Produit mis à jour avec succès" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Erreur de serveur" });
    }
  });
};
