const Product = require("../models/product");
const Category = require("../models/category");
const Ingrediant = require("../models/ingrediant");
const Type = require("../models/type");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const { forwardToMediaBackend, resolveMediaFromRequest } = require("../utils/mediaHelper");
const localUpload = require("../middleware/localMulter");
const Media = require("../models/media");
const cleanupTempFile = require("../utils/cleanupTempFiles");
const Settings = require("../models/settings");
const Restaurant = require("../models/restaurant");
const moment = require("moment-timezone");
const { default: mongoose } = require("mongoose");
const RESTAURANT_TIMEZONE = process.env.RESTAURANT_TIMEZONE || "Europe/Paris";

const parseArrayField = (field) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === "string") {
    try {
      return JSON.parse(field);
    } catch {
      return field.split(",").filter(Boolean);
    }
  }
  return [];
};
const getFinalPrice = (product, useFormulePrice = false) => {
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

  return calculateDiscountInfo(product);
};

const calculateDiscountInfo = (product) => {
  const now = moment().tz(RESTAURANT_TIMEZONE);
  let hasActiveDiscount = false;
  let currentPrice = product.price;
  let originalPrice = product.originalPrice || product.price;
  let discountAmount = 0;

  if (product.discountValue > 0) {
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
  const upload = localUpload.single("image");
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }
    if (!req.file && !req.body.mediaId) {
      return res.status(400).json({
        message: req.t("product.add_image"),
        error: req.t("errors.image_required"),
      });
    }

    let tempFilePath = null;
    try {
      const { restaurantId } = req;
      // const { categoryId } = req.params;
      const categoryIds = Array.isArray(req.body.categories)
        ? req.body.categories
        : JSON.parse(req.body.categories || "[]");
      const userId = req.user.user._id;
      const price = Number(req.body.price ?? "");
      const name = req.body.name.replace(/"/g, "");
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
        tva,
      } = req.body;
      const typeIds = req.body.type || [];
      const allergyIds = parseArrayField(req.body.allergies);

      if (!name || !restaurantId) {
        if (req.file) await cleanupTempFile(req.file.path);
        return res.status(400).json({
          message: req.t("product.fields_required"),
        });
      }

      if (req.file) {
        tempFilePath = req.file.path;
      }

      let existingProduct = await Product.findOne({ name: name, restaurantId });

      if (existingProduct) {
        if (tempFilePath) await cleanupTempFile(tempFilePath);
        return res.status(400).json({
          message: req.t("product.exists"),
        });
      }

      const mediaDoc = await resolveMediaFromRequest({
        req,
        restaurantId,
        userId,
        targetType: "Product",
        type: "product",
      });

      if (req.file) {
        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      let typeVariationsData = null;
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

      if (discountValue < 0) {
        await cleanupTempFile(tempFilePath);
        return res.status(400).json({
          message: req.t("product.discount.value_gt_zero"),
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
          await cleanupTempFile(tempFilePath);
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
        categories: categoryIds,
        outOfStock,
        visible,
        type: parsedTypeIds,
        typeVariations: typeVariationsData,
        createdBy: userId,
        choice,
        restaurantId,
        image: mediaDoc._id,
        tva: tva ? Number(tva) : 0,
        allergies: allergyIds,
      });
      const savedProduct = await product.save();

      await Media.findByIdAndUpdate(mediaDoc._id, {
        targetId: savedProduct._id,
      });
      const updatedCategories = await Category.updateMany(
        { _id: { $in: categoryIds }, restaurantId },
        { $addToSet: { products: product._id } },
        { new: true }
      );

      res.status(201).json({
        ...savedProduct.toObject(),
        categories: updatedCategories,
        message: req.t("product.created"),
      });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
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
    const products = await Product.find({
      categories: { $in: [categoryId] },
      restaurantId,
    })
      .populate([
        {
          path: "type",
          select: "name mode message payment selection max min tva",
        },
        {
          path: "categories",
          select: "name image",
          populate: { path: "image", select: "url" },
        },
        {
          path: "allergies",
          select: "name icon",
          populate: { path: "icon", select: "url" },
        },
        {
          path: "image",
          select: "url",
        },
      ])
      .sort({ position: 1 });

    const productsWithDiscounts = products.map((product) => {
      const productObj = product.toObject();
      const discountInfo = calculateDiscountInfo(productObj);

      return {
        ...productObj,
        image: productObj.image?.url || productObj.image || null,
        categories: productObj.categories?.map((cat) => ({
          ...cat,
          image: cat.image?.url || cat.image || null,
        })),
        allergies: productObj.allergies?.map((allergy) => ({
          ...allergy,
          icon: allergy.icon?.url || allergy.icon || null,
        })),
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

    const products = await Product.aggregate([
      {
        $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId) },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "types",
          localField: "type",
          foreignField: "_id",
          as: "type", // This will be an array of type objects
          pipeline: [
            {
              $project: {
                name: 1,
                mode: 1,
                message: 1,
                payment: 1,
                selection: 1,
                max: 1,
                min: 1,
                tva: 1,
              },
            },
          ],
        },
      },

      {
        $lookup: {
          from: "media",
          localField: "image",
          foreignField: "_id",
          as: "image",
          pipeline: [{ $project: { url: 1 } }],
        },
      },
      {
        $addFields: {
          image: { $arrayElemAt: ["$image.url", 0] },
        },
      },

      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
          pipeline: [
            {
              $project: {
                name: 1,
                image: 1,
              },
            },
            {
              $lookup: {
                from: "media",
                localField: "image",
                foreignField: "_id",
                as: "image",
                pipeline: [{ $project: { url: 1 } }],
              },
            },
            {
              $addFields: {
                image: { $arrayElemAt: ["$image.url", 0] },
              },
            },
          ],
        },
      },

      {
        $lookup: {
          from: "allergies",
          localField: "allergies",
          foreignField: "_id",
          as: "allergies",
          pipeline: [
            {
              $project: {
                name: 1,
                icon: 1,
              },
            },
            {
              $lookup: {
                from: "media",
                localField: "icon",
                foreignField: "_id",
                as: "icon",
                pipeline: [{ $project: { url: 1 } }],
              },
            },
            {
              $addFields: {
                icon: { $arrayElemAt: ["$icon.url", 0] },
              },
            },
          ],
        },
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

exports.getSeuleProducts = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const products = await Product.find({
      restaurantId,
      choice: "seul",
    })
      .populate([
        {
          path: "type",
          select: "name mode message payment selection max min tva",
        },
        {
          path: "image",
          select: "url",
        },
      ])
      .lean();

    const transformedProducts = products.map((product) => ({
      ...product,
      image: product.image?.url || null,
    }));

    res.status(200).json(transformedProducts);
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
    const product = await Product.findOne({
      _id: productId,
      restaurantId: restaurantId,
    })
      .populate({
        path: "image",
        select: "url",
      })
      .populate({
        path: "type",
        select:
          "name message payment selection max min tva ingredients products",
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

    if (product.image && typeof product.image === "object") {
      product.image = product.image.url || null;
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
            select:
              "name image price suppPrice outOfStock visible variations position",
            options: { sort: { position: 1 } },
            populate: [
              {
                path: "variations",
                model: "Variation",
                select: "name price",
              },
              {
                path: "image",
                select: "url",
              },
            ],
          })
          .populate({
            path: "products",
            select:
              "name price image outOfStock visible discountValue originalPrice discountStartDate discountEndDate tva formulePrice position",
            options: { sort: { position: 1 } },
            populate: {
              path: "image",
              select: "url",
            },
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
              const ingredientImage = ing.image;
              const imageUrl =
                ingredientImage && typeof ingredientImage === "object"
                  ? ingredientImage.url
                  : ingredientImage;
              const variation = ing.variations?.find(
                (v) => v._id.toString() === variationId
              );
              const basePrice = !typeDoc.payment ? ing.suppPrice : ing.price;
              const price = variation ? variation.price : basePrice;
              return {
                _id: ing._id,
                name: ing.name,
                image: imageUrl,
                price,
                outOfStock: ing.outOfStock,
                position: ing.position ?? 0,
                // visible: ing.visible,
              };
            })
            .sort((a, b) => a.position - b.position);
          if (ingrediants.length) {
            out.ingrediants = ingrediants; // <- renamed field
          }
        }

        // PRODUCTS (if you are allowing extra products on same Type)
        if (Array.isArray(typeDoc.products) && typeDoc.products.length > 0) {
          let prodDocs = typeDoc.products
            .filter((p) => p.visible && !p.outOfStock)
            .map((p) => {
              const productImage = p.image;
              const imageUrl =
                productImage && typeof productImage === "object"
                  ? productImage.url
                  : productImage;
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
                image: imageUrl,
                price: finalPrice,
                hasDiscount: hasDiscount,
                originalPrice: originalPrice,
                outOfStock: p.outOfStock,
                position: p.position ?? 0,
                // visible: p.visible,
              };
            })
            .sort((a, b) => a.position - b.position);
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
  const upload = localUpload.single("image");
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }
    let tempFilePath = null;
    const { productId } = req.params;
    const { restaurantId } = req;
    try {
      const {
        name,
        price,
        formulePrice,
        description,
        outOfStock,
        visible,
        supplements,
        ingrediants,
        categories,
        choice,
        typeVariation,
        variations,
        discountValue,
        discountStartDate,
        discountEndDate,
        tva,
      } = req.body;

      const typeFromBody = req.body.type || [];
      const parsedTypeIds = Array.isArray(typeFromBody)
        ? typeFromBody
        : typeof typeFromBody === "string"
        ? JSON.parse(typeFromBody)
        : [];
      const allergyIds = parseArrayField(req.body.allergies);
      const product = await Product.findOne({ _id: productId, restaurantId });
      if (!product) {
        if (req.file) await cleanupTempFile(req.file.path);
        return res.status(404).json({ message: req.t("product.not_found") });
      }
      const oldCategories = product.categories.map((id) => id.toString());
      const newCategories = Array.isArray(categories) ? categories : [];

      const removedCategories = oldCategories.filter(
        (id) => !newCategories.includes(id)
      );
      const addedCategories = newCategories.filter(
        (id) => !oldCategories.includes(id)
      );

      if (removedCategories.length > 0) {
        await Category.updateMany(
          { _id: { $in: removedCategories }, restaurantId },
          { $pull: { products: product._id } }
        );
      }

      if (addedCategories.length > 0) {
        await Category.updateMany(
          { _id: { $in: addedCategories }, restaurantId },
          { $addToSet: { products: product._id } }
        );
      }

      product.categories = newCategories;
      let typeVariationsData = null;
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

      if (req.file || req.body.mediaId) {
        if (req.file) {
          tempFilePath = req.file.path;
        }

        const newMediaDoc = await resolveMediaFromRequest({
          req,
          restaurantId,
          userId: req.user?.user?._id,
          targetType: "Product",
          targetId: product._id,
          type: "product",
        });

        product.image = newMediaDoc._id;

        if (tempFilePath) {
          await cleanupTempFile(tempFilePath);
          tempFilePath = null;
        }
      }

      if (discountValue < 0) {
        return res.status(400).json({
          message: req.t("product.discount.value_gt_zero"),
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
      product.tva = tva ? Number(tva) : product.tva;
      product.allergies = allergyIds;
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
      product.type = parsedTypeIds;
      product.typeVariations = typeVariationsData || product.typeVariations;

      const updatedProduct = await product.save();

      res.status(200).json({
        ...updatedProduct.toObject(),
        message: req.t("product.updated_success"),
      });
    } catch (error) {
      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
      }
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

exports.migrateProductsCategory = async (req, res) => {
  try {
    const { restaurantId } = req;
    const collection = mongoose.connection.db.collection("products");

    const filter = {
      category: { $exists: true, $ne: null, $ne: "" },
      $or: [
        { categories: { $exists: false } },
        { categories: null },
        { categories: { $size: 0 } },
      ],
    };

    if (restaurantId) {
      filter.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    }

    // Use raw MongoDB update — legacy `category` is not on the Mongoose schema,
    // so Product.find() never loads it and the old loop saved empty arrays.
    const result = await collection.updateMany(filter, [
      {
        $set: {
          categories: {
            $cond: {
              if: { $ne: ["$category", null] },
              then: {
                $cond: {
                  if: { $eq: [{ $type: "$category" }, "string"] },
                  then: [{ $toObjectId: "$category" }],
                  else: [{ $category }],
                },
              },
              else: [],
            },
          },
        },
      },
      { $unset: "category" },
    ]);

    res.status(200).json({
      message: "Products migration completed!",
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Migration failed", error: error.message });
  }
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
