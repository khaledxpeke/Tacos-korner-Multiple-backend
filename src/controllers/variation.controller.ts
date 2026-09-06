import type { Request, Response } from "express";
import { Variation } from "../models/variation.model";
import { Ingrediant } from "../models/ingrediant.model";
import { Product } from "../models/product.model";
import { TypeVariation } from "../models/typeVariation.model";
import { errorMessage } from "../utils/helpers";

export const addVariation = async (req: Request, res: Response) => {
  const { name } = req.body;
  const { restaurantId } = req;
  try {
    const variation = new Variation({ name, restaurantId });
    await variation.save();
    res.status(201).json({
      variation,
      message: req.t("variation.created"),
    });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const getVariations = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const variations = await Variation.find({ restaurantId });
    res.status(200).json(variations);
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const updateVariation = async (req: Request, res: Response) => {
  const { variationId } = req.params;
  const { name } = req.body;
  const { restaurantId } = req;

  try {
    const variation = await Variation.findOne({
      _id: variationId,
      restaurantId,
    });
    if (!variation) {
      return res.status(404).json({ message: req.t("variation.not_found") });
    }

    variation.name = name;
    await variation.save();
    res.status(200).json({ message: req.t("variation.updated") });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const deleteVariation = async (req: Request, res: Response) => {
  const { variationId } = req.params;
  const { restaurantId } = req;
  try {
    await Variation.findOneAndDelete({ _id: variationId, restaurantId });
    await Ingrediant.updateMany(
      { "variations._id": variationId, restaurantId },
      { $pull: { variations: { _id: variationId } } }
    );
    await Product.updateMany(
      { "typeVariations.variations._id": variationId, restaurantId },
      { $pull: { "typeVariations.variations": { _id: variationId } } }
    );
    await TypeVariation.updateMany(
      { variations: variationId, restaurantId },
      { $pull: { variations: variationId } }
    );
    res.status(200).json({ message: req.t("variation.deleted") });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};
