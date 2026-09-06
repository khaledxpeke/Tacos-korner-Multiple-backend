import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import moment from "moment-timezone";
import { Product } from "../models/product.model";
import { Category } from "../models/category.model";
import { Ingrediant } from "../models/ingrediant.model";
import { Media } from "../models/media.model";
import { resolveMediaFromRequest } from "../services/media.service";
import localUpload from "../middleware/localMulter";
import cleanupTempFile from "../utils/cleanupTempFiles";
import { env } from "../config/environment";
import { errorMessage } from "../utils/helpers";
import { parseArrayField } from "../utils/parse-array-field";
import {
  addTimezoneZ,
  calculateDiscountInfo,
} from "../services/product-discount.service";

export {
  getProductsByCategory,
  getAllProducts,
  getSeuleProducts,
  getProductData,
} from "./product-read.controller";

const RESTAURANT_TIMEZONE = env.restaurantTimezone;

export const addProductToCategory = async (req: Request, res: Response, next: NextFunction) => {
  const upload = localUpload.single("image");
  upload(req, res, async (err: unknown) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: errorMessage(err),
      });
    }
    if (!req.file && !req.body.mediaId) {
      return res.status(400).json({
        message: req.t("product.add_image"),
        error: req.t("errors.image_required"),
      });
    }

    let tempFilePath: string | null = null;
    try {
      const { restaurantId } = req;
      // const { categoryId } = req.params;
      const categoryIds = Array.isArray(req.body.categories)
        ? req.body.categories
        : JSON.parse(req.body.categories || "[]");
      const userId = req.user!.user._id;
      const price = Number(req.body.price ?? "");
      const name = (req.body.name as string).replace(/"/g, "");
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

      const existingProduct = await Product.findOne({ name: name, restaurantId });

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

      let typeVariationsData: {
        typeVariation: unknown;
        variations: Array<{ _id: unknown; price: number }>;
      } | null = null;
      if (typeVariation && variations) {
        const parsedVariations = Array.isArray(variations)
          ? variations
          : JSON.parse(variations);
        typeVariationsData = {
          typeVariation: typeVariation,
          variations: parsedVariations.map((v: { _id?: unknown; price?: number }) => ({
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
      const productPayload = {
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
        image: mediaDoc!._id,
        tva: tva ? Number(tva) : 0,
        allergies: allergyIds,
      };
      const product = new Product(productPayload);
      const savedProduct = await product.save();

      await Media.findByIdAndUpdate(mediaDoc!._id, {
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
        error: errorMessage(error),
      });
    }
  });
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
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
      error: errorMessage(error),
    });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const upload = localUpload.single("image");
  upload(req, res, async (err: unknown) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: errorMessage(err),
      });
    }
    let tempFilePath: string | null = null;
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
        (id: string) => !oldCategories.includes(id)
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
      let typeVariationsData: {
        typeVariation: unknown;
        variations: Array<{ _id: unknown; price: number }>;
      } | null = null;
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
            variations: parsedVariations.map((v: { _id?: unknown; price?: number }) => ({
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

        product.image = newMediaDoc!._id;

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
      product.allergies = allergyIds as typeof product.allergies;
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

      Object.assign(product, {
        supplements: supplements ? (supplements as string).split(",") : [],
        ingrediants: ingrediants ? (ingrediants as string).split(",") : [],
      });
      product.type = parsedTypeIds;
      product.typeVariations =
        (typeVariationsData || product.typeVariations) as typeof product.typeVariations;

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

declare const $category: unknown;

export const migrateProductsCategory = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const collection = mongoose.connection.db!.collection("products");

    const categoryFilter: Record<string, unknown> = { $exists: true };
    categoryFilter.$ne = null;
    categoryFilter.$ne = "";
    const filter: Record<string, unknown> = {
      category: categoryFilter,
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
    res.status(500).json({ message: "Migration failed", error: errorMessage(error) });
  }
};

export const setProductDiscount = async (req: Request, res: Response) => {
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

    const discountInfo = calculateDiscountInfo(product.toObject());

    res.status(200).json({
      message: req.t("product.discount.applied"),
      ...product.toObject(),
      ...discountInfo,
    });
  } catch (error) {
    res.status(500).json({
      message: req.t("errors.unknown"),
      error: errorMessage(error),
    });
  }
};

export const removeProductDiscount = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { restaurantId } = req;

    const product = await Product.findOne({ _id: productId, restaurantId });
    if (!product) {
      return res.status(404).json({ message: req.t("product.not_found") });
    }

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
      error: errorMessage(error),
    });
  }
};
