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
const moment = require("moment-timezone");
const RESTAURANT_TIMEZONE = process.env.RESTAURANT_TIMEZONE || "Europe/Paris";

// Helper function to calculate discount information
const calculateDiscountInfo = (product) => {
  const now = moment().tz(RESTAURANT_TIMEZONE);
  let hasActiveDiscount = false;
  let currentPrice = product.price;
  let originalPrice = product.originalPrice || product.price;
  let discountAmount = 0;

  if (product.discountValue > 0) {
    // Check if discount is within active period
    const isAfterStart = !product.discountStartDate || now.isAfter(moment(product.discountStartDate).tz(RESTAURANT_TIMEZONE));
    const isBeforeEnd = !product.discountEndDate || now.isBefore(moment(product.discountEndDate).tz(RESTAURANT_TIMEZONE));
    
    if (isAfterStart && isBeforeEnd) {
      hasActiveDiscount = true;
      discountAmount = Math.min(product.discountValue, originalPrice);
      currentPrice = originalPrice - discountAmount;
    }
  }

  return {
    price: Math.round(currentPrice * 100) / 100,
    originalPrice: hasActiveDiscount ? originalPrice : null,
    hasDiscount: hasActiveDiscount,
    discountValue: hasActiveDiscount ? product.discountValue : null,
    discountAmount: hasActiveDiscount ? Math.round(discountAmount * 100) / 100 : 0,
    discountActive: hasActiveDiscount
  };
};

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

    // Add discount information to each product
    const productsWithDiscounts = products.map(product => {
      const discountInfo = calculateDiscountInfo(product.toObject());
      return {
        ...product.toObject(),
        ...discountInfo
      };
    });

    res.status(200).json(productsWithDiscounts);
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

    // Calculate discount information
    const discountInfo = calculateDiscountInfo(product);

    res.status(200).json({
      ...product,
      ...discountInfo,
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
    res.status(200).json({ message: "Produit supprimer avec succées" });
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

// Helper function to add Z to date strings if missing (same as coupon controller)
const addTimezoneZ = (dateString) => {
  if (!dateString) return null;
  
  if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.match(/-\d{2}:\d{2}$/)) {
    return dateString + 'Z';
  }
  
  return dateString;
};

exports.setProductDiscount = async (req, res) => {
  try {
    const { productId } = req.params;
    const { restaurantId } = req;
    const {
      discountValue,
      discountStartDate,
      discountEndDate
    } = req.body;

    if (!discountValue) {
      return res.status(400).json({
        message: "Valeur de remise requise"
      });
    }

    if (discountValue <= 0) {
      return res.status(400).json({
        message: "La valeur de la remise doit être supérieure à 0"
      });
    }

    const product = await Product.findOne({ _id: productId, restaurantId });
    if (!product) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    // Validate date interval if provided
    if (discountStartDate && discountEndDate) {
      const start = moment(addTimezoneZ(discountStartDate)).tz(RESTAURANT_TIMEZONE);
      const end = moment(addTimezoneZ(discountEndDate)).tz(RESTAURANT_TIMEZONE);
      
      if (start.isSameOrAfter(end)) {
        return res.status(400).json({
          message: "La date et l'heure de fin doivent être postérieures à la date et l'heure de début"
        });
      }
    }

    // Store original price if not already stored
    if (!product.originalPrice) {
      product.originalPrice = product.price;
    }

    product.discountValue = Number(discountValue);
    product.discountStartDate = discountStartDate ? moment(addTimezoneZ(discountStartDate)).tz(RESTAURANT_TIMEZONE).toDate() : null;
    product.discountEndDate = discountEndDate ? moment(addTimezoneZ(discountEndDate)).tz(RESTAURANT_TIMEZONE).toDate() : null;

    await product.save();

    // Calculate and return discount info
    const discountInfo = calculateDiscountInfo(product.toObject());

    res.status(200).json({
      message: "Remise appliquée avec succès",
      product: {
        ...product.toObject(),
        ...discountInfo
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Une erreur s'est produite",
      error: error.message
    });
  }
};

exports.removeProductDiscount = async (req, res) => {
  try {
    const { productId } = req.params;
    const { restaurantId } = req;

    const product = await Product.findOne({ _id: productId, restaurantId });
    if (!product) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    // Reset discount fields
    product.discountValue = 0;
    product.discountStartDate = null;
    product.discountEndDate = null;
    product.originalPrice = null;

    await product.save();

    res.status(200).json({
      message: "Remise supprimée avec succès",
      product: product
    });
  } catch (error) {
    res.status(500).json({
      message: "Une erreur s'est produite",
      error: error.message
    });
  }
};
