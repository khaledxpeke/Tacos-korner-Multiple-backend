import type { Request, Response } from "express";
import { TypeVariation } from "../models/typeVariation.model";
import { Ingrediant } from "../models/ingrediant.model";
import { Product } from "../models/product.model";
import { errorMessage } from "../utils/helpers";

export const addTypeVariation = async (req: Request, res: Response) => {
  const { name, label, description, variations } = req.body;
  try {
    const { restaurantId } = req;
    const typeVariationExist = await TypeVariation.findOne({
      name,
      restaurantId,
    });
    if (typeVariationExist) {
      return res.status(400).json({ message: req.t("type_variation.exists") });
    }
    const typeVariation = new TypeVariation({
      name,
      label,
      description,
      variations,
      restaurantId,
    });
    await typeVariation.save();
    res.status(201).json({
      typeVariation,
      message: req.t("type_variation.created"),
    });
  } catch {
    res.status(500).json({ message: req.t("type_variation.fetch_error") });
  }
};

export const getTypeVariations = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const typeVariations = await TypeVariation.find({ restaurantId }).populate("variations");
    res.status(200).json(typeVariations);
  } catch {
    res.status(500).json({ message: req.t("type_variation.fetch_error") });
  }
};

export const updateTypeVariation = async (req: Request, res: Response) => {
  const { typeVariationId } = req.params;
  const { name, label, description, variations } = req.body;
  const { restaurantId } = req;

  try {
    const typeVariation = await TypeVariation.findOne({
      _id: typeVariationId,
      restaurantId,
    });
    if (!typeVariation) {
      return res.status(404).json({ message: req.t("type_variation.not_found") });
    }

    typeVariation.name = name;
    typeVariation.label = label;
    typeVariation.description = description;
    typeVariation.variations = variations;
    await typeVariation.save();
    res.status(200).json({ message: req.t("type_variation.updated") });
  } catch {
    res.status(500).json({ message: req.t("type_variation.fetch_error") });
  }
};

export const deleteTypeVariation = async (req: Request, res: Response) => {
  const { typeVariationId } = req.params;
  const { restaurantId } = req;
  try {
    await TypeVariation.findOneAndDelete({
      _id: typeVariationId,
      restaurantId,
    });
    await Ingrediant.updateMany(
      { typeVariation: typeVariationId, restaurantId },
      { $pull: { typeVariation: typeVariationId } }
    );
    await Product.updateMany(
      { typeVariation: typeVariationId, restaurantId },
      { $pull: { typeVariation: typeVariationId } }
    );
    res.status(200).json({ message: req.t("type_variation.deleted") });
  } catch {
    res.status(500).json({ message: req.t("type_variation.fetch_error") });
  }
};
