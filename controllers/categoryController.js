const Category = require("../models/category");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const Product = require("../models/product");
const { forwardToMediaBackend } = require("../utils/mediaHelper");
const localUpload = require("../middleware/localMulter");
const Media = require("../models/media");
const cleanupTempFile = require("../utils/cleanupTempFiles");
const { default: mongoose } = require("mongoose");

exports.createCategory = async (req, res) => {
  const upload = localUpload.single("image");
  upload(req, res, async (err) => {
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

    let tempFilePath = null;
    const userId = req.user.user._id;
    const { name } = req.body;
    const { restaurantId } = req;

    try {
      if (!name || !restaurantId) {
        await cleanupTempFile(req.file.path);
        return res.status(400).json({
          message: req.t("category.fields_required"),
        });
      }
      tempFilePath = req.file.path;

      const mediaResponse = await forwardToMediaBackend({
        filePath: tempFilePath,
        restaurantId: restaurantId.toString(),
        type: "category",
        originalname: req.file.originalname,
      });

      const category = new Category({
        createdBy: userId,
        name,
        image: null,
        restaurantId,
      });

      await category.save();

      let mediaDoc = await Media.findOne({ hash: mediaResponse.hash });
      if (!mediaDoc) {
        mediaDoc = new Media({
          filename: mediaResponse.filename || req.file.originalname,
          url: mediaResponse.url,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: userId,
          targetType: "Category",
          targetId: category._id,
          type: "category",
          restaurantId: restaurantId.toString(),
          scope: "shared",
        });
        await mediaDoc.save();
      }

      category.image = mediaDoc._id;
      await category.save();

      await cleanupTempFile(tempFilePath);
      tempFilePath = null;

      res.status(201).json({ category, message: req.t("category.created") });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);

      console.error(
        "❌ Create category error:",
        error.response?.data || error.message
      );
      res.status(400).json({
        message: req.t("errors.unknown"),
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
        path: "image", 
        select: "url",
      })
      .populate({
        path: "products",
        match: { visible: true },
        select:
          "name price formulePrice image type choice description categories outOfStock variations visible originalPrice discountValue discountStartDate discountEndDate tva allergies",
        options: { sort: { position: 1 } },
        populate: [
          {
            path: "image",
            select: "url",
          },
          {
            path: "type",
            select:
              "name label message min selection payment max ingredients products mode",
            populate: [
              {
                path: "ingredients.ingredient",
                model: "Ingrediant",
                select: "name image price suppPrice outOfStock visible",
                populate: {
                  path: "image",
                  select: "url",
                },
              },
              {
                path: "products.product",
                model: "Product",
                select:
                  "name price formulePrice image outOfStock visible discountValue",
                populate: {
                  path: "image",
                  select: "url",
                },
              },
            ],
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
          {
            path: "allergies",
            model: "Allergy",
            select: "name icon",
            populate: {
              path: "icon",
              select: "url",
            },
          },
        ],
      });

    const populatedCategories = categories.map((category) =>
      category.toObject({ virtuals: true })
    );
    populatedCategories.forEach((category) => {
      if (category.image && typeof category.image === "object") {
        category.image = category.image.url || null;
      }
      category.products = category.products.filter(
        (product) => product.visible
      );

      category.products.forEach((product) => {
        if (product.image && typeof product.image === "object") {
          product.image = product.image.url || null;
        }
        const now = new Date();

        let hasDiscount = false;
        if (
          typeof product.discountValue === "number" &&
          product.discountValue > 0
        ) {
          const start = product.discountStartDate
            ? new Date(product.discountStartDate)
            : null;
          const end = product.discountEndDate
            ? new Date(product.discountEndDate)
            : null;
          if ((!start || now >= start) && (!end || now <= end))
            hasDiscount = true;
        }
        if (hasDiscount) {
          product.originalPrice = product.price;
          product.price = Number(
            (product.price - product.discountValue).toFixed(2)
          );
        } else {
          product.originalPrice = null;
        }

        delete product.discountStartDate;
        delete product.discountEndDate;
        delete product.visible;

        if (product.typeVariations && product.typeVariations.variations) {
          const { typeVariation, variations } = product.typeVariations;
          const validVariations = variations.filter(
            (v) => v?._id?._id && v._id?.name && typeof v._id._id === "object"
          );
          product.typeVariations =
            validVariations.length > 0
              ? {
                  _id: typeVariation._id,
                  name: typeVariation.name,
                  label: typeVariation.label,
                  description: typeVariation.description,
                  variations: validVariations.map((v) => ({
                    _id: v._id._id,
                    name: v._id.name,
                    price: v.price || 0,
                  })),
                }
              : null;
        }

        if (product.type) {
          product.type.forEach((t) => {
            if (t.ingredients) {
              t.ingrediants = t.ingredients
                .filter(
                  (ing) =>
                    ing.ingredient &&
                    ing.ingredient.visible &&
                    !ing.ingredient.outOfStock
                )
                .map((ing) => {
                  const basePrice = !t.payment
                    ? ing.ingredient.suppPrice
                    : ing.ingredient.price;
                  const ingredientImage = ing.ingredient.image;
                  const imageUrl =
                    ingredientImage && typeof ingredientImage === "object"
                      ? ingredientImage.url
                      : ingredientImage;
                  return {
                    _id: ing.ingredient._id,
                    name: ing.ingredient.name,
                    image: imageUrl,
                    price: Number((basePrice ?? 0).toFixed(2)),
                    outOfStock: ing.ingredient.outOfStock,
                    position: ing.position ?? 0,
                  };
                })
                .sort((a, b) => a.position - b.position);
              if (!t.ingrediants.length) delete t.ingrediants;
              delete t.ingredients;
            }

            if (t.products) {
              t.products = t.products
                .filter(
                  (p) => p.product && p.product.visible && !p.product.outOfStock
                )
                .map((p) => {
                  const pn = p.product;
                  let finalPrice = pn.price;
                  let hasDiscount = false;
                  let originalPrice = null;
                  const productImage = pn.image;
                  const imageUrl =
                    productImage && typeof productImage === "object"
                      ? productImage.url
                      : productImage;

                  if (pn.formulePrice && pn.formulePrice > 0) {
                    finalPrice = pn.formulePrice;
                  } else if (pn.discountValue > 0) {
                    const start = pn.discountStartDate
                      ? new Date(pn.discountStartDate)
                      : null;
                    const end = pn.discountEndDate
                      ? new Date(pn.discountEndDate)
                      : null;
                    if ((!start || now >= start) && (!end || now <= end)) {
                      hasDiscount = true;
                      originalPrice = pn.price;
                      finalPrice = Number(
                        (pn.price - pn.discountValue).toFixed(2)
                      );
                    }
                  }
                  return {
                    _id: pn._id,
                    name: pn.name,
                    image: imageUrl,
                    price: finalPrice,
                    hasDiscount,
                    originalPrice,
                    outOfStock: pn.outOfStock,
                    position: p.position ?? 0,
                  };
                })
                .sort((a, b) => a.position - b.position);

              if (!t.products.length) delete t.products;
            }
          });

          product.type = product.type.filter(
            (t) => t.ingrediants || t.products
          );
        }
        if (product.allergies && Array.isArray(product.allergies)) {
          product.allergies = product.allergies.map((allergy) => {
            const iconObj = allergy.icon;
            const iconUrl =
              iconObj && typeof iconObj === "object" ? iconObj.url : iconObj;

            return {
              _id: allergy._id,
              name: allergy.name,
              icon: iconUrl,
            };
          });
        }
        product.category = category._id;
        delete product.categories;
      });

      category.products = category.products.filter((p) => p);
    });

    const finalCategories = populatedCategories.filter(
      (category) => category.products && category.products.length > 0
    );

    res.status(200).json(finalCategories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllCategory = async (req, res) => {
  try {
    const { restaurantId } = req;

    const categories = await Category.aggregate([
      { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId) } },
      { $sort: { position: 1 } },
      {
        $lookup: {
          from: "products",
          localField: "products",
          foreignField: "_id",
          as: "products",
        },
      },
      {
        $lookup: {
          from: "media",
          localField: "image",
          foreignField: "_id",
          as: "image",
        },
      },
      {
        $addFields: {
          image: { $arrayElemAt: ["$image.url", 0] },
        },
      },
    ]);

    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  const upload = localUpload.single("image");
  upload(req, res, async (err) => {
    if (err) {
      console.log(err);
      return res
        .status(500)
        .json({ message: req.t("errors.image_upload_failed") });
    }

    let tempFilePath = null;
    const categoryId = req.params.categoryId;
    const { restaurantId } = req;
    const { name } = req.body;

    try {
      const category = await Category.findOne({
        _id: categoryId,
        restaurantId,
      });
      if (!category) {
        return res.status(404).json({ message: req.t("category.not_found") });
      }
      if (name) category.name = name;

      if (req.file) {
        tempFilePath = req.file.path;
        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: restaurantId.toString(),
          type: "category",
          originalname: req.file.originalname,
        });

        let newMediaDoc = await Media.findOne({ hash: mediaResponse.hash });

        if (!newMediaDoc) {
          newMediaDoc = new Media({
            filename: mediaResponse.filename || req.file.originalname,
            url: mediaResponse.url,
            mimeType: mediaResponse.mimeType || req.file.mimetype,
            size: mediaResponse.size || req.file.size,
            hash: mediaResponse.hash,
            uploadedBy: req.user?.user?._id,
            targetType: "Category",
            targetId: category._id,
            type: "category",
            restaurantId: restaurantId.toString(),
            scope: "shared",
          });
          await newMediaDoc.save();
        }

        category.image = newMediaDoc._id;

        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      await category.save();

      res.status(200).json({
        category,
        message: req.t("category.updated"),
      });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);

      console.error("❌ Update category error:", error.message);
      res.status(500).json({ message: req.t("errors.unknown") });
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
          { _id: productId, category: { $in: [categoryId] }, restaurantId },
          { $set: { position } },
          { new: true }
        );
      })
    );

    res.status(200).json({ message: req.t("category.positions_updated") });
  } catch (error) {
    res.status(400).json({
      message: req.t("errors.unknown"),
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

    res.status(200).json({ message: req.t("category.positions_updated") });
  } catch (error) {
    res.status(400).json({
      message: req.t("errors.unknown"),
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
      return res.status(404).json({ message: req.t("category.not_found") });
    }

    await Product.deleteMany({ category: categoryId, restaurantId });

    await Category.findOneAndDelete({ _id: categoryId, restaurantId });

    res.status(200).json({ message: req.t("category.deleted") });
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};
