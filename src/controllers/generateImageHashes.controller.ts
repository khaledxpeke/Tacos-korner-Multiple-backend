import type { Request, Response } from "express";
import type { Model } from "mongoose";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { Ingrediant } from "../models/ingrediant.model";
import { Extra } from "../models/extra.model";
import { Desert } from "../models/desert.model";
import { Drink } from "../models/drink.model";
import { Restaurant } from "../models/restaurant.model";
import { Settings } from "../models/settings.model";
import { errorMessage } from "../utils/helpers";

async function removeImageHashes(Model: Model<unknown>, hashField = "imagePreviewHash") {
  const result = await Model.updateMany(
    { [hashField]: { $exists: true } },
    { $unset: { [hashField]: "" } },
    { strict: false }
  );
  console.log(
    `[${Model.modelName}] Hash removed for ${result.modifiedCount || 0} documents`
  );
  return result.modifiedCount || 0;
}

export const removeAllImageHashes = async (_req: Request, res: Response) => {
  try {
    const catCount = await removeImageHashes(Category as unknown as Model<unknown>);
    const prodCount = await removeImageHashes(Product as unknown as Model<unknown>);
    const ingCount = await removeImageHashes(Ingrediant as unknown as Model<unknown>);
    const extraCount = await removeImageHashes(Extra as unknown as Model<unknown>);
    const dessertCount = await removeImageHashes(Desert as unknown as Model<unknown>);
    const drinkCount = await removeImageHashes(Drink as unknown as Model<unknown>);
    const restaurantCount = await removeImageHashes(
      Restaurant as unknown as Model<unknown>,
      "imagePreviewHash"
    );
    const settingsCount = await removeImageHashes(
      Settings as unknown as Model<unknown>,
      "imagePreviewHash"
    );
    res.status(200).json({
      message: "Image hashes removed",
      categoriesUpdated: catCount,
      productsUpdated: prodCount,
      ingrediantsUpdated: ingCount,
      extrasUpdated: extraCount,
      dessertsUpdated: dessertCount,
      drinksUpdated: drinkCount,
      restaurantsUpdated: restaurantCount,
      settingsUpdated: settingsCount,
    });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};
