import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Ingrediant } from "../models/ingrediant.model";
import { Product } from "../models/product.model";
import { Type } from "../models/type.model";
import { resolveMediaFromRequest } from "../services/media.service";
import localUpload from "../middleware/localMulter";
import cleanupTempFile from "../utils/cleanupTempFiles";
import { errorMessage } from "../utils/helpers";

export const createIngredient = async (req: Request, res: Response, next: NextFunction) => {
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
    const { restaurantId } = req;

    const { name, typeIds, price, outOfStock, visible, suppPrice, variations } =
      req.body;
    const userId = req.user!.user._id;
    let tempFilePath: string | null = null;
    try {
      const nameAlreadyExist = await Ingrediant.findOne({
        name: name,
        restaurantId,
      });
      if (nameAlreadyExist) {
        if (req.file) await cleanupTempFile(req.file.path);
        return res.status(400).json({ message: req.t("ingrediant.exists") });
      }
      let typesArray: mongoose.Types.ObjectId[] = [];
      if (typeIds) {
        typesArray = Array.isArray(typeIds) ? typeIds : JSON.parse(typeIds);

        typesArray = typesArray.map((id) => new mongoose.Types.ObjectId(id));
      }

      let variationsArray: unknown[] = [];
      if (variations) {
        variationsArray = Array.isArray(variations)
          ? variations
          : JSON.parse(variations);
      }
      if (req.file) {
        tempFilePath = req.file.path;
      }

      const ingredient = new Ingrediant({
        name,
        image: null,
        types: typesArray,
        variations: variationsArray || [],
        outOfStock,
        visible,
        suppPrice,
        createdBy: userId,
        restaurantId,
      });
      if (price) {
        ingredient.price = price;
      }
      await ingredient.save();

      const mediaDoc = await resolveMediaFromRequest({
        req,
        restaurantId,
        userId,
        targetType: "Ingrediant",
        targetId: ingredient._id,
        type: "ingredient",
      });

      ingredient.image = mediaDoc!._id;
      await ingredient.save();

      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }
      res
        .status(201)
        .json({ ingredient, message: req.t("ingrediant.created") });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
      return res.status(400).json({
        message: req.t("product.error"),
        error: errorMessage(error),
      });
    }
  });
};

export const getAllIngrediants = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;

    const ingrediants = await Ingrediant.aggregate([
      { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId as string) } },

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
          from: "types",
          let: { ingrediantId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: [
                    "$$ingrediantId",
                    { $ifNull: ["$ingredients.ingredient", []] },
                  ],
                },
              },
            },
            { $project: { _id: 1, name: 1 } },
          ],
          as: "types",
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(200).json(ingrediants);
  } catch (error) {
    return res.status(400).json({
      message: req.t("ingrediant.not_found"),
      error: errorMessage(error),
    });
  }
};

export const updateIngrediant = async (req: Request, res: Response) => {
  const { restaurantId } = req;
  const ingrediantId = req.params.ingrediantId;
  const upload = localUpload.single("image");
  upload(req, res, async (err: unknown) => {
    const { name, types, price, outOfStock, visible, suppPrice, variations } =
      req.body;
    let variationsArray: unknown[] = [];
    if (variations) {
      variationsArray = Array.isArray(variations)
        ? variations
        : JSON.parse(variations);
    }
    if (err) {
      console.log(err);
      return res.status(500).json({ message: req.t("product.error") });
    }
    let tempFilePath: string | null = null;
    try {
      const ingrediant = await Ingrediant.findOne({
        _id: ingrediantId,
        restaurantId,
      });
      if (!ingrediant) {
        return res.status(404).json({ message: req.t("ingrediant.not_found") });
      }

      if (req.file || req.body.mediaId) {
        if (req.file) {
          tempFilePath = req.file.path;
        }

        const newMediaDoc = await resolveMediaFromRequest({
          req,
          restaurantId,
          userId: req.user?.user?._id,
          targetType: "Ingrediant",
          targetId: ingrediant._id,
          type: "ingredient",
        });

        ingrediant.image = newMediaDoc!._id;

        if (tempFilePath) {
          await cleanupTempFile(tempFilePath);
          tempFilePath = null;
        }
      }
      ingrediant.name = name || ingrediant.name;
      ingrediant.types = types || ingrediant.types;
      ingrediant.outOfStock = outOfStock || ingrediant.outOfStock;
      ingrediant.visible = visible || ingrediant.visible;
      ingrediant.suppPrice = suppPrice || ingrediant.suppPrice;
      ingrediant.variations = (variationsArray || ingrediant.variations) as typeof ingrediant.variations;
      if (price !== undefined) {
        ingrediant.price = (price !== "" ? price : null) as number | undefined;
      }
      const updatedIngrediant = await ingrediant.save();

      const products = await Product.find({
        ingrediants: ingrediantId,
        restaurantId,
      });

      for (const product of products) {
        const ingrediants = await Promise.all(
          (product as typeof product & { ingrediants: unknown[] }).ingrediants.map(
            async (ingrediantRef: unknown) => {
              return await Ingrediant.findOne({ _id: ingrediantRef, restaurantId });
            }
          )
        );
        const typeLists = ingrediants.map((found) => found!.types).flat();
        const uniqueTypes = typeLists.reduce(
          (
            unique: Array<{ _id: { toString(): string } }>,
            current
          ) => {
            const currentObj = current as unknown as { _id: { toString(): string } };
            const isDuplicate = unique.some(
              (obj) => obj._id.toString() === currentObj._id.toString()
            );
            if (!isDuplicate) {
              unique.push(currentObj);
            }
            return unique;
          },
          []
        );

        await Product.findOneAndUpdate(
          { _id: product._id, restaurantId },
          { type: uniqueTypes }
        );
      }

      return res.status(200).json({ message: req.t("ingrediant.updated") });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
      return res
        .status(500)
        .json({ message: req.t("product.error"), error: errorMessage(error) });
    }
  });
};

export const deleteIngredient = async (req: Request, res: Response, next: NextFunction) => {
  const { ingrediantId } = req.params;
  const { restaurantId } = req;
  try {
    const ingrediant = await Ingrediant.findOne({
      _id: ingrediantId,
      restaurantId,
    });

    if (!ingrediant) {
      return res.status(404).json({
        message: req.t("ingrediant.not_found"),
      });
    }

    await Ingrediant.deleteOne({ _id: ingrediant._id, restaurantId });

    await Product.findOneAndUpdate(
      { _id: ingrediant.product, restaurantId },
      {
        $pull: { ingrediants: ingrediantId },
      }
    );

    await Type.updateMany(
      { restaurantId },
      { $pull: { ingredients: { ingredient: ingrediant._id } } }
    );

    return res.status(200).json({
      message: req.t("ingrediant.deleted"),
    });
  } catch (error) {
    return res.status(500).json({
      message: req.t("product.error"),
      error: errorMessage(error),
    });
  }
};
