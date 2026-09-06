import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Product } from "../models/product.model";
import { Type } from "../models/type.model";
import { errorMessage } from "../utils/helpers";
import { calculateDiscountInfo } from "../services/product-discount.service";
import type { DiscountableProduct, MediaRef } from "../interfaces/product.interface";

export const getProductsByCategory = async (req: Request, res: Response, next: NextFunction) => {
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
      const productObj = product.toObject() as DiscountableProduct & {
        image?: MediaRef | string | null;
        categories?: Array<Record<string, unknown> & { image?: MediaRef | string | null }>;
        allergies?: Array<Record<string, unknown> & { icon?: MediaRef | string | null }>;
      };
      const discountInfo = calculateDiscountInfo(productObj);

      return {
        ...productObj,
        image: (productObj.image as MediaRef | undefined)?.url || productObj.image || null,
        categories: productObj.categories?.map((cat) => ({
          ...cat,
          image: (cat.image as MediaRef | undefined)?.url || cat.image || null,
        })),
        allergies: productObj.allergies?.map((allergy) => ({
          ...allergy,
          icon: (allergy.icon as MediaRef | undefined)?.url || allergy.icon || null,
        })),
        ...discountInfo,
      };
    });

    res.status(200).json(productsWithDiscounts);
  } catch (error) {
    res.status(400).json({
      message: req.t("product.error"),
      error: errorMessage(error),
    });
  }
};

export const getAllProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { restaurantId } = req;

    const products = await Product.aggregate([
      {
        $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId as string) },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "types",
          localField: "type",
          foreignField: "_id",
          as: "type",
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
      error: errorMessage(error),
    });
  }
};

export const getSeuleProducts = async (req: Request, res: Response, next: NextFunction) => {
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
      image: (product.image as MediaRef | undefined)?.url || null,
    }));

    res.status(200).json(transformedProducts);
  } catch (error) {
    res.status(400).json({
      message: req.t("product.error"),
      error: errorMessage(error),
    });
  }
};

export const getProductData = async (req: Request, res: Response) => {
  try {
    const { productId, variationId } = req.params;
    const { restaurantId } = req;
    const found = await Product.findOne({
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

    if (!found) {
      return res.status(404).json({ message: req.t("product.not_found") });
    }

    const product = found as DiscountableProduct & {
      image?: MediaRef | string | null;
      type?: Array<{ _id?: unknown }>;
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
      };
      hasDiscount?: boolean;
    };

    if (product.image && typeof product.image === "object") {
      product.image = product.image.url || null;
    }

    if (product.typeVariations) {
      const { typeVariation, variations } = product.typeVariations;
      product.typeVariations = {
        _id: typeVariation!._id,
        name: typeVariation!.name,
        label: typeVariation!.label,
        description: typeVariation!.description,
        variations: (variations || []).map((v) => ({
          _id: v._id!._id,
          name: v._id!.name,
          price: v.price,
        })),
      } as typeof product.typeVariations;
    }

    const typesExpanded = await Promise.all(
      (product.type || []).map(async (t) => {
        const typeDoc = (await Type.findOne({ _id: t._id, restaurantId })
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
          .lean()) as {
          _id: unknown;
          name?: string;
          message?: string;
          payment?: boolean;
          selection?: boolean;
          max?: number;
          min?: number;
          ingredients?: Array<{
            _id?: unknown;
            name?: string;
            image?: MediaRef | string | null;
            price?: number;
            suppPrice?: number;
            outOfStock?: boolean;
            visible?: boolean;
            variations?: Array<{ _id: { toString(): string }; price?: number }>;
            position?: number;
          }>;
          products?: Array<
            DiscountableProduct & {
              _id?: unknown;
              name?: string;
              image?: MediaRef | string | null;
              outOfStock?: boolean;
              visible?: boolean;
              position?: number;
            }
          >;
        } | null;

        if (!typeDoc) return null;

        const out: {
          _id: unknown;
          name?: string;
          message?: string;
          payment?: boolean;
          selection?: boolean;
          max?: number;
          min?: number;
          ingrediants?: Array<{
            _id?: unknown;
            name?: string;
            image?: string | null;
            price?: number;
            outOfStock?: boolean;
            position: number;
          }>;
          products?: Array<{
            _id?: unknown;
            name?: string;
            image?: string | null;
            price?: number;
            hasDiscount: boolean;
            originalPrice: number | null;
            outOfStock?: boolean;
            position: number;
          }>;
        } = {
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
            out.ingrediants = ingrediants;
          }
        }

        if (Array.isArray(typeDoc.products) && typeDoc.products.length > 0) {
          const prodDocs = typeDoc.products
            .filter((p) => p.visible && !p.outOfStock)
            .map((p) => {
              const productImage = p.image;
              const imageUrl =
                productImage && typeof productImage === "object"
                  ? productImage.url
                  : productImage;
              let finalPrice: number | undefined;
              let hasDiscount = false;
              let originalPrice = null;

              if (p.formulePrice && p.formulePrice > 0) {
                finalPrice = p.formulePrice;
              } else {
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

    product.type = typesExpanded.filter(Boolean) as typeof product.type;

    const discountInfo = calculateDiscountInfo(product);
    product.price = discountInfo.price;
    product.originalPrice = discountInfo.originalPrice;
    product.hasDiscount = discountInfo.hasDiscount;

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({
      message: req.t("errors.unknown"),
      error: errorMessage(error),
    });
  }
};
