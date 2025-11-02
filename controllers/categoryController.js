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
      res.status(201).json({ newCategory, message: req.t("category.created") });
    } catch (error) {
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
        match: { visible: true }, // only show visible products
        options: { sort: { position: 1 } },
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
                path: "ingredients",
                model: "Ingrediant",
                select: "name image price suppPrice outOfStock visible",
                options: { sort: { position: 1 } },
              },
              {
                path: "products",
                model: "Product",
                select:
                  "name price formulePrice image outOfStock visible discountValue",
                options: { sort: { position: 1 } },
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

    const populatedCategories = categories
      .map((category) => {
        const categoryObj = category.toObject();
        categoryObj.products = category.products
          .filter((product) => product.visible)
          .map((product) => {
            const productObj = product.toObject();

            // Discount logic
            let now = new Date();
            let hasDiscount = false;
            if (
              typeof productObj.discountValue === "number" &&
              productObj.discountValue > 0
            ) {
              const start = productObj.discountStartDate
                ? new Date(productObj.discountStartDate)
                : null;
              const end = productObj.discountEndDate
                ? new Date(productObj.discountEndDate)
                : null;
              if ((!start || now >= start) && (!end || now <= end)) {
                hasDiscount = true;
              }
            }
            if (hasDiscount) {
              productObj.originalPrice = productObj.price;
              productObj.price = Number(
                (productObj.price - productObj.discountValue).toFixed(2)
              );
            } else {
              productObj.originalPrice = null;
            }

            // TypeVariations logic
            if (
              productObj.typeVariations &&
              productObj.typeVariations.variations
            ) {
              const { typeVariation, variations } = productObj.typeVariations;
              const validVariations = variations.filter(
                (v) =>
                  v?._id?._id && v._id?.name && typeof v._id._id === "object"
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

            delete productObj.discountStartDate;
            delete productObj.discountEndDate;
            delete productObj.visible;
            // New Type and Ingredients logic
            productObj.type = (productObj.type || [])
              .map((type) => {
                const hasIngredients =
                  Array.isArray(type.ingredients) &&
                  type.ingredients.length > 0;

                const hasProducts =
                  Array.isArray(type.products) && type.products.length > 0;

                if (!hasIngredients && !hasProducts) return null;

                const typeOut = {
                  _id: type._id,
                  name: type.name,
                  label: type.label,
                  message: type.message,
                  min: type.min,
                  max: type.max,
                  selection: type.selection,
                  payment: type.payment,
                  mode: type.mode,
                };

                if (hasIngredients) {
                  typeOut.ingrediants = type.ingredients
                    .filter((ing) => ing.visible && !ing.outOfStock)
                    .map((ing) => {
                      const basePrice = !type.payment
                        ? ing.suppPrice
                        : ing.price;
                      return {
                        _id: ing._id,
                        name: ing.name,
                        image: ing.image,
                        price: Number((basePrice ?? 0).toFixed(2)),
                        outOfStock: ing.outOfStock,
                        position: ing.position ?? 0,
                        // visible: ing.visible,
                      };
                    })
                    .sort((a, b) => a.position - b.position);
                  if (!typeOut.ingrediants.length) delete typeOut.ingrediants;
                }

                if (hasProducts) {
                  typeOut.products = type.products
                    .filter((p) => p.visible && !p.outOfStock)
                    .map((p) => {
                      // Check if formulePrice > 0, if so use it directly, otherwise calculate discount
                      const pn = { ...p };
                      let finalPrice,
                        hasDiscount = false,
                        originalPrice = null;

                      if (pn.formulePrice && pn.formulePrice > 0) {
                        // Use formule price directly without discount
                        finalPrice = pn.formulePrice;
                      } else {
                        // Use regular price with discount calculation
                        let pHasDiscount = false;
                        if (
                          typeof pn.discountValue === "number" &&
                          pn.discountValue > 0
                        ) {
                          const ps = pn.discountStartDate
                            ? new Date(pn.discountStartDate)
                            : null;
                          const pe = pn.discountEndDate
                            ? new Date(pn.discountEndDate)
                            : null;
                          if ((!ps || now >= ps) && (!pe || now <= pe)) {
                            pHasDiscount = true;
                          }
                        }
                        finalPrice = pn.price;
                        if (pHasDiscount) {
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
                        hasDiscount: hasDiscount,
                        originalPrice,
                        outOfStock: pn.outOfStock,
                        position: p.position ?? 0,
                        // visible: pn.visible,
                      };
                    }).sort((a, b) => a.position - b.position);
                  if (!typeOut.products.length) delete typeOut.products;
                }

                if (!typeOut.ingrediants && !typeOut.products) return null;
                return typeOut;
              })
              .filter((t) => t !== null);

            return productObj;
          });
        return categoryObj;
      })
      .filter((category) => category.products.length > 0);

    res.status(200).json(populatedCategories);
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
  const categoryId = req.params.categoryId;
  req.uploadTarget = "category";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
      console.log(err);
      return res
        .status(500)
        .json({ message: req.t("errors.image_upload_failed") });
    }
    const category = await Category.findOne({ _id: categoryId, restaurantId });
    if (!category) {
      return res.status(404).json({ message: req.t("category.not_found") });
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
        .json({ updatedcategory, message: req.t("category.updated") });
    } catch (error) {
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
