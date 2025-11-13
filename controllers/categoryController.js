const Category = require("../models/category");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const fs = require("fs").promises;
const path = require("path");
const Product = require("../models/product");
const { forwardToMediaBackend } = require("../utils/mediaHelper");
const localUpload = require("../middleware/localMulter");
const Media = require("../models/media");

async function cleanupTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch (cleanupErr) {
    console.error("Error deleting temp file:", cleanupErr);
  }
}
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
    const image = `uploads/category/${req.file?.filename}` || "";
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
        type: "categories",
        originalname: req.file.originalname,
      });

      const category = new Category({
        createdBy: userId,
        name,
        image: mediaResponse.url,
        restaurantId,
      });

      const mediaDoc = new Media({
        filename: req.file.originalname,
        url: mediaResponse.url,
        mimeType: mediaResponse.mimeType || req.file.mimetype,
        size: mediaResponse.size || req.file.size,
        hash: mediaResponse.hash,
        uploadedBy: userId,
        targetType: "category",
        targetId: null,
      });

      mediaDoc.targetId = category._id;
      await mediaDoc.save();

      await cleanupTempFile(tempFilePath);
      tempFilePath = null;

      await category.save();
      res.status(201).json({ category, message: req.t("category.created") });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
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
        path: "products",
        match: { visible: true },
        select:
          "name price formulePrice image type choice description categories outOfStock variations visible originalPrice discountValue discountStartDate discountEndDate tva",
        options: { sort: { position: 1 } },
        populate: [
          {
            path: "type",
            select:
              "name label message min selection payment max ingredients products mode",
            populate: [
              {
                path: "ingredients.ingredient",
                model: "Ingrediant",
                select: "name image price suppPrice outOfStock visible",
              },
              {
                path: "products.product",
                model: "Product",
                select:
                  "name price formulePrice image outOfStock visible discountValue",
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
        ],
      });

    const populatedCategories = categories.map((category) =>
      category.toObject({ virtuals: true })
    );
    populatedCategories.forEach((category) => {
      category.products = category.products.filter(
        (product) => product.visible
      );

      category.products.forEach((product) => {
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
                  return {
                    _id: ing.ingredient._id,
                    name: ing.ingredient.name,
                    image: ing.ingredient.image,
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
                    image: pn.image,
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
    const categories = await Category.find({ restaurantId })
      .populate("products")
      .sort("position");
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

      if (req.file) {
        tempFilePath = req.file.path;

        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: restaurantId.toString(),
          type: "categories",
          originalname: req.file.originalname,
        });

        const mediaDoc = new Media({
          filename: req.file.originalname,
          url: mediaResponse.url,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: req.user?.user?._id,
          targetType: "category",
          targetId: category._id,
        });
        await mediaDoc.save();

        category.image = mediaResponse.url;

        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      if (name) category.name = name;

      await category.save();

      res.status(200).json({
        category,
        message: req.t("category.updated"),
      });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
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

    if (category.image) {
      const imagePath = path.join(__dirname, "..", category.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Category.findOneAndDelete({ _id: categoryId, restaurantId });

    res.status(200).json({ message: req.t("category.deleted") });
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};
