const Product = require("../models/product");
const Category = require("../models/category");
const Ingrediant = require("../models/ingrediant");
const Type = require("../models/type");
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

// Helper function to get the final price (formule price or regular price with discount)
const getFinalPrice = (product, useFormulePrice = false) => {
  // If formule price should be used and is greater than 0, return it directly
  if (useFormulePrice && product.formulePrice > 0) {
    return {
      price: product.formulePrice,
      originalPrice: null,
      hasDiscount: false,
      discountValue: null,
      discountAmount: 0,
      discountActive: false,
      isUsingFormulePrice: true,
    };
  }

  // Otherwise, use regular discount calculation
  return calculateDiscountInfo(product);
};

// Helper function to calculate discount information
const calculateDiscountInfo = (product) => {
  const now = moment().tz(RESTAURANT_TIMEZONE);
  let hasActiveDiscount = false;
  let currentPrice = product.price;
  let originalPrice = product.originalPrice || product.price;
  let discountAmount = 0;

  if (product.discountValue > 0) {
    // Check if discount is within active period
    const isAfterStart =
      !product.discountStartDate ||
      now.isAfter(moment(product.discountStartDate).tz(RESTAURANT_TIMEZONE));
    const isBeforeEnd =
      !product.discountEndDate ||
      now.isBefore(moment(product.discountEndDate).tz(RESTAURANT_TIMEZONE));

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
    discountAmount: hasActiveDiscount
      ? Math.round(discountAmount * 100) / 100
      : 0,
    discountActive: hasActiveDiscount,
    isUsingFormulePrice: false,
  };
};

exports.addProductToCategory = async (req, res, next) => {
  req.uploadTarget = "product";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: req.t("product.add_image"),
        error: req.t("errors.image_required"),
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
      formulePrice,
      discountValue,
      discountStartDate,
      discountEndDate,
    } = req.body;
    const typeIds = req.body.type || [];

    try {
      let typeVariationsData = null;
      let product = await Product.findOne({ name: name, restaurantId });

      if (product) {
        return res.status(400).json({
          message: req.t("product.exists"),
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

        if (discountValue <= 0) {
          return res.status(400).json({
            message: req.t("product.discount.value_gt_zero"),
          });
        }
        if (discountValue > price) {
          return res.status(400).json({
            message: req.t("product.discount.value_lt_price"),
          });
        }
        if (discountStartDate && discountEndDate) {
          const start = moment(addTimezoneZ(discountStartDate)).tz(
            RESTAURANT_TIMEZONE
          );
          const end = moment(addTimezoneZ(discountEndDate)).tz(
            RESTAURANT_TIMEZONE
          );

          if (start.isSameOrAfter(end)) {
            return res.status(400).json({
              message: req.t("product.discount.end_after_start"),
            });
          }
        }
        const product = new Product({
          name,
          description,
          price,
          formulePrice: formulePrice ? Number(formulePrice) : 0,
          discountValue: Number(discountValue) || 0,
          discountStartDate: discountStartDate
            ? moment(addTimezoneZ(discountStartDate))
                .tz(RESTAURANT_TIMEZONE)
                .toDate()
            : null,

          discountEndDate: discountEndDate
            ? moment(addTimezoneZ(discountEndDate))
                .tz(RESTAURANT_TIMEZONE)
                .toDate()
            : null,
          originalPrice: price || null,
          supplements: [],
          ingrediants: [],
          category: categoryId,
          outOfStock,
          visible,
          type: parsedTypeIds,
          typeVariations: typeVariationsData,
          createdBy: userId,
          choice,
          restaurantId,
          image,
        });
        const savedProduct = await product.save();

        const updatedCategory = await Category.findOneAndUpdate(
          { _id: categoryId, restaurantId },
          { $push: { products: savedProduct._id } },
          { new: true }
        );

        res.status(201).json({
          ...savedProduct.toObject(),
          category: updatedCategory,
          message: req.t("product.created"),
        });
      }
    } catch (error) {
      res.status(400).json({
        message: req.t("product.error"),
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
        select: "name mode message payment selection max min",
      })
      .sort({ position: 1 });

    // Add discount information to each product
    const productsWithDiscounts = products.map((product) => {
      const discountInfo = calculateDiscountInfo(product.toObject());
      return {
        ...product.toObject(),
        ...discountInfo,
      };
    });

    res.status(200).json(productsWithDiscounts);
  } catch (error) {
    res.status(400).json({
      message: req.t("product.error"),
      error: error.message,
    });
  }
};
exports.getAllProducts = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const products = await Product.find({ restaurantId })
      .populate([
        {
          path: "type",
          select: "name mode message payment selection max min",
        },
      ])
      .sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    res.status(400).json({
      message: req.t("product.error"),
      error: error.message,
    });
  }
};

exports.getSeuleProducts = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const products = await Product.find({
      restaurantId,
      choice: "seul",
    }).populate([
      {
        path: "type",
        select: "name mode message payment selection max min",
      },
    ]);
    res.status(200).json(products);
  } catch (error) {
    res.status(400).json({
      message: req.t("product.error"),
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
        select: "name message payment selection max min ",
      })
      .populate({
        path: "typeVariations.typeVariation",
        model: "TypeVariation",
        select: "name label description",
      })
      .populate("typeVariations.variations._id", "name")
      .lean();

    if (!product) {
      return res.status(404).json({ message: req.t("product.not_found") });
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

    const typesExpanded = await Promise.all(
      (product.type || []).map(async (t) => {
        const typeDoc = await Type.findOne({ _id: t._id, restaurantId })
          .populate({
            path: "ingredients",
            select: "name image price suppPrice outOfStock visible variations",
            populate: {
              path: "variations",
              model: "Variation",
              select: "name price",
            },
          })
          .populate({
            path: "products",
            select:
              "name price image outOfStock visible discountValue originalPrice discountStartDate discountEndDate",
          })
          .lean();

        if (!typeDoc) return null;

        const out = {
          _id: typeDoc._id,
          name: typeDoc.name,
          message: typeDoc.message,
          payment: typeDoc.payment,
          selection: typeDoc.selection,
          max: typeDoc.max,
          min: typeDoc.min,
        };

        if (
          Array.isArray(typeDoc.ingredients) &&
          typeDoc.ingredients.length > 0
        ) {
          const ingrediants = typeDoc.ingredients
            .filter((ing) => ing.visible && !ing.outOfStock)
            .map((ing) => {
              const variation = ing.variations?.find(
                (v) => v._id.toString() === variationId
              );
              const basePrice = !typeDoc.payment ? ing.suppPrice : ing.price;
              const price = variation ? variation.price : basePrice;
              return {
                _id: ing._id,
                name: ing.name,
                image: ing.image,
                price,
                outOfStock: ing.outOfStock,
                // visible: ing.visible,
              };
            });
          if (ingrediants.length) {
            out.ingrediants = ingrediants; // <- renamed field
          }
        }

        // PRODUCTS (if you are allowing extra products on same Type)
        if (Array.isArray(typeDoc.products) && typeDoc.products.length > 0) {
          let prodDocs = typeDoc.products
            .filter((p) => p.visible && !p.outOfStock)
            .map((p) => {
              // Check if formulePrice > 0, if so use it directly, otherwise calculate discount
              let finalPrice,
                hasDiscount = false,
                originalPrice = null;

              if (p.formulePrice && p.formulePrice > 0) {
                // Use formule price directly without discount
                finalPrice = p.formulePrice;
              } else {
                // Use regular price with discount calculation
                const discountInfo = calculateDiscountInfo(p);
                finalPrice = discountInfo.price;
                hasDiscount = discountInfo.hasDiscount;
                originalPrice = discountInfo.originalPrice;
              }

              return {
                _id: p._id,
                name: p.name,
                image: p.image,
                price: finalPrice,
                hasDiscount: hasDiscount,
                originalPrice: originalPrice,
                outOfStock: p.outOfStock,
                // visible: p.visible,
              };
            });
          if (prodDocs.length) {
            out.products = prodDocs;
          }
        }

        if (!out.ingrediants && !out.products) return null;
        return out;
      })
    );

    product.type = typesExpanded.filter(Boolean);

    const discountInfo = calculateDiscountInfo(product);
    product.price = discountInfo.price;
    product.originalPrice = discountInfo.originalPrice;
    product.hasDiscount = discountInfo.hasDiscount;

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({
      message: req.t("errors.unknown"),
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
      return res.status(404).json({ message: req.t("product.not_found") });
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
    res.status(200).json({ message: req.t("product.deleted") });
  } catch (error) {
    res.status(400).json({
      message: req.t("product.error"),
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
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }
    const {
      name,
      price,
      formulePrice,
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
      discountValue,
      discountStartDate,
      discountEndDate,
    } = req.body;

    try {
      let typeVariationsData = null;
      const product = await Product.findOne({ _id: productId, restaurantId });
      if (!product) {
        return res.status(404).json({ message: req.t("product.not_found") });
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
      } else if (req.body.image && req.body.image !== product.image) {
        product.image = req.body.image;
      }

      if (discountValue <= 0) {
        return res.status(400).json({
          message: req.t("product.discount.value_gt_zero"),
        });
      }
      if (discountValue > price) {
        return res.status(400).json({
          message: req.t("product.discount.value_lt_price"),
        });
      }
      if (discountStartDate && discountEndDate) {
        const start = moment(addTimezoneZ(discountStartDate)).tz(
          RESTAURANT_TIMEZONE
        );
        const end = moment(addTimezoneZ(discountEndDate)).tz(
          RESTAURANT_TIMEZONE
        );

        if (start.isSameOrAfter(end)) {
          return res.status(400).json({
            message: req.t("product.discount.end_after_start"),
          });
        }
      }
      product.name = name || product.name;
      product.description =
        description !== undefined ? description : product.description;
      product.outOfStock = outOfStock || product.outOfStock;
      product.visible = visible || product.visible;
      product.price = price || product.price;
      product.discountValue = Number(discountValue) || 0;
      product.discountStartDate = discountStartDate
        ? moment(addTimezoneZ(discountStartDate))
            .tz(RESTAURANT_TIMEZONE)
            .toDate()
        : null;

      product.discountEndDate = discountEndDate
        ? moment(addTimezoneZ(discountEndDate)).tz(RESTAURANT_TIMEZONE).toDate()
        : null;
      if (!product.originalPrice) {
        product.originalPrice = product.price;
      }
      product.formulePrice =
        formulePrice !== undefined
          ? Number(formulePrice)
          : product.formulePrice;
      product.choice = choice || product.choice;

      product.supplements = supplements ? supplements.split(",") : [];

      product.ingrediants = ingrediants ? ingrediants.split(",") : [];
      product.type = type ? type.split(",") : [];
      product.typeVariations = typeVariationsData || product.typeVariations;

      const updatedProduct = await product.save();

      res.status(200).json({
        ...updatedProduct.toObject(),
        message: req.t("product.updated_success"),
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: req.t("errors.unknown") });
    }
  });
};

// Helper function to add Z to date strings if missing (same as coupon controller)
const addTimezoneZ = (dateString) => {
  if (!dateString) return null;
  // If only YYYY-MM-DD, add time and Z
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString + "T00:00:00Z";
  }
  // If ends with Z or has timezone, return as is
  if (
    dateString.includes("T") &&
    (dateString.includes("Z") ||
      dateString.includes("+") ||
      dateString.match(/-\d{2}:\d{2}$/))
  ) {
    return dateString;
  }
  // If only date with Z (e.g., 2025-08-01Z), fix to ISO
  if (/^\d{4}-\d{2}-\d{2}Z$/.test(dateString)) {
    return dateString.replace("Z", "T00:00:00Z");
  }
  return dateString;
};

exports.setProductDiscount = async (req, res) => {
  try {
    const { productId } = req.params;
    const { restaurantId } = req;
    const { discountValue, discountStartDate, discountEndDate } = req.body;

    if (!discountValue) {
      return res.status(400).json({
        message: req.t("product.discount.value_required"),
      });
    }

    if (discountValue <= 0) {
      return res.status(400).json({
        message: req.t("product.discount.value_gt_zero"),
      });
    }

    const product = await Product.findOne({ _id: productId, restaurantId });
    if (!product) {
      return res.status(404).json({ message: req.t("product.not_found") });
    }

    if (discountValue > product.price) {
      return res.status(400).json({
        message: req.t("product.discount.value_lt_price"),
      });
    }

    // Validate date interval if provided
    if (discountStartDate && discountEndDate) {
      const start = moment(addTimezoneZ(discountStartDate)).tz(
        RESTAURANT_TIMEZONE
      );
      const end = moment(addTimezoneZ(discountEndDate)).tz(RESTAURANT_TIMEZONE);

      if (start.isSameOrAfter(end)) {
        return res.status(400).json({
          message: req.t("product.discount.end_after_start"),
        });
      }
    }

    // Store original price if not already stored
    if (!product.originalPrice) {
      product.originalPrice = product.price;
    }

    product.discountValue = Number(discountValue);
    product.discountStartDate = discountStartDate
      ? moment(addTimezoneZ(discountStartDate)).tz(RESTAURANT_TIMEZONE).toDate()
      : null;
    product.discountEndDate = discountEndDate
      ? moment(addTimezoneZ(discountEndDate)).tz(RESTAURANT_TIMEZONE).toDate()
      : null;

    await product.save();

    // Calculate and return discount info
    const discountInfo = calculateDiscountInfo(product.toObject());

    res.status(200).json({
      message: req.t("product.discount.applied"),
      ...product.toObject(),
      ...discountInfo,
    });
  } catch (error) {
    res.status(500).json({
      message: req.t("errors.unknown"),
      error: error.message,
    });
  }
};

exports.removeProductDiscount = async (req, res) => {
  try {
    const { productId } = req.params;
    const { restaurantId } = req;

    const product = await Product.findOne({ _id: productId, restaurantId });
    if (!product) {
      return res.status(404).json({ message: req.t("product.not_found") });
    }

    // Reset discount fields
    product.discountValue = 0;
    product.discountStartDate = null;
    product.discountEndDate = null;
    product.originalPrice = null;

    await product.save();

    res.status(200).json({
      message: req.t("product.discount.removed"),
      ...product.toObject(),
    });
  } catch (error) {
    res.status(500).json({
      message: req.t("errors.unknown"),
      error: error.message,
    });
  }
};
