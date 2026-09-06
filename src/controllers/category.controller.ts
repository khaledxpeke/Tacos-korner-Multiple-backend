import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { resolveMediaFromRequest } from "../services/media.service";
import localUpload from "../middleware/localMulter";
import cleanupTempFile from "../utils/cleanupTempFiles";
import { errorMessage } from "../utils/helpers";

interface MediaRef {
  url?: string;
}

interface CategoryProductView {
  visible?: boolean;
  image?: MediaRef | string | null;
  discountValue?: number;
  discountStartDate?: Date | string | null;
  discountEndDate?: Date | string | null;
  price: number;
  originalPrice?: number | null;
  typeVariations?: {
    typeVariation?: {
      _id?: unknown;
      name?: string;
      label?: string;
      description?: string;
    };
    variations?: Array<{
      _id?: { _id?: unknown; name?: string };
      name?: string;
      price?: number;
    }>;
    _id?: unknown;
    name?: string;
    label?: string;
    description?: string;
  } | null;
  type?: Array<{
    payment?: boolean;
    ingredients?: Array<{
      ingredient?: {
        _id?: unknown;
        name?: string;
        image?: MediaRef | string | null;
        price?: number;
        suppPrice?: number;
        outOfStock?: boolean;
        visible?: boolean;
      };
      position?: number;
    }>;
    ingrediants?: Array<{
      _id?: unknown;
      name?: string;
      image?: string | null;
      price: number;
      outOfStock?: boolean;
      position: number;
    }>;
    products?: Array<{
      product?: {
        _id?: unknown;
        name?: string;
        image?: MediaRef | string | null;
        price: number;
        formulePrice?: number;
        outOfStock?: boolean;
        visible?: boolean;
        discountValue?: number;
        discountStartDate?: Date | string | null;
        discountEndDate?: Date | string | null;
      };
      position?: number;
      _id?: unknown;
      name?: string;
      image?: string | null;
      price?: number;
      hasDiscount?: boolean;
      originalPrice?: number | null;
      outOfStock?: boolean;
    }>;
  }>;
  allergies?: Array<{
    _id?: unknown;
    name?: string;
    icon?: MediaRef | string | null;
  }>;
  category?: unknown;
  categories?: unknown;
}

interface CategoryView {
  _id?: unknown;
  image?: MediaRef | string | null;
  products: CategoryProductView[];
}

export const createCategory = async (req: Request, res: Response) => {
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
    const userId = req.user!.user._id;
    const { name } = req.body;
    const { restaurantId } = req;

    try {
      if (!name || !restaurantId) {
        if (req.file) await cleanupTempFile(req.file.path);
        return res.status(400).json({
          message: req.t("category.fields_required"),
        });
      }

      const category = new Category({
        createdBy: userId,
        name,
        image: null,
        restaurantId,
      });

      await category.save();

      if (req.file) {
        tempFilePath = req.file.path;
      }

      const mediaDoc = await resolveMediaFromRequest({
        req,
        restaurantId,
        userId,
        targetType: "Category",
        targetId: category._id,
        type: "category",
      });

      category.image = mediaDoc!._id;
      await category.save();

      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      res.status(201).json({ category, message: req.t("category.created") });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);

      const axiosLike = error as { response?: { data?: unknown }; message?: string };
      console.error(
        "❌ Create category error:",
        axiosLike.response?.data || axiosLike.message
      );
      res.status(400).json({
        message: req.t("errors.unknown"),
        error: errorMessage(error),
      });
    }
  });
};

export const getAllCategories = async (req: Request, res: Response) => {
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
    ) as CategoryView[];
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
            (product.price - product.discountValue!).toFixed(2)
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
          product.typeVariations = (
            validVariations.length > 0
              ? {
                  _id: typeVariation!._id,
                  name: typeVariation!.name,
                  label: typeVariation!.label,
                  description: typeVariation!.description,
                  variations: validVariations.map((v) => ({
                    _id: v._id!._id,
                    name: v._id!.name,
                    price: v.price || 0,
                  })),
                }
              : null
          ) as CategoryProductView["typeVariations"];
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
                    ? ing.ingredient!.suppPrice
                    : ing.ingredient!.price;
                  const ingredientImage = ing.ingredient!.image;
                  const imageUrl =
                    ingredientImage && typeof ingredientImage === "object"
                      ? ingredientImage.url
                      : ingredientImage;
                  return {
                    _id: ing.ingredient!._id,
                    name: ing.ingredient!.name,
                    image: imageUrl ?? null,
                    price: Number((basePrice ?? 0).toFixed(2)),
                    outOfStock: ing.ingredient!.outOfStock,
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
                  const pn = p.product!;
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
                  } else if (pn.discountValue! > 0) {
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
                        (pn.price - pn.discountValue!).toFixed(2)
                      );
                    }
                  }
                  return {
                    _id: pn._id,
                    name: pn.name,
                    image: imageUrl ?? null,
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
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const getAllCategory = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;

    const categories = await Category.aggregate([
      { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId as string) } },
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
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  const upload = localUpload.single("image");
  upload(req, res, async (err: unknown) => {
    if (err) {
      console.log(err);
      return res
        .status(500)
        .json({ message: req.t("errors.image_upload_failed") });
    }

    let tempFilePath: string | null = null;
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

      if (req.file || req.body.mediaId) {
        if (req.file) {
          tempFilePath = req.file.path;
        }

        const newMediaDoc = await resolveMediaFromRequest({
          req,
          restaurantId,
          userId: req.user?.user?._id,
          targetType: "Category",
          targetId: category._id,
          type: "category",
        });

        category.image = newMediaDoc!._id;

        if (tempFilePath) {
          await cleanupTempFile(tempFilePath);
          tempFilePath = null;
        }
      }

      await category.save();

      res.status(200).json({
        category,
        message: req.t("category.updated"),
      });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);

      console.error("❌ Update category error:", errorMessage(error));
      res.status(500).json({ message: req.t("errors.unknown") });
    }
  });
};

export const updatePositions = async (req: Request, res: Response) => {
  try {
    const { positions } = req.body;
    const { categoryId } = req.params;
    const { restaurantId } = req;

    await Promise.all(
      positions.map(async ({ productId, position }: { productId: string; position: number }) => {
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
      error: errorMessage(error),
    });
  }
};

export const updateCategoryPositions = async (req: Request, res: Response) => {
  try {
    const { positions } = req.body;
    const { restaurantId } = req;

    for (const { categoryId, position } of positions as Array<{
      categoryId: string;
      position: number;
    }>) {
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
      error: errorMessage(error),
    });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  const categoryId = req.params.categoryId;
  const { restaurantId } = req;
  try {
    const category = await Category.findOne({ _id: categoryId, restaurantId });
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
