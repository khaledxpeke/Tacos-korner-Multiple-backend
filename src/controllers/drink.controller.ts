import type { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { Drink } from "../models/drink.model";
import multerStorage from "../middleware/multerStorage";
import { PROJECT_ROOT } from "../config/paths";
import { errorMessage } from "../utils/helpers";

const upload = multer({ storage: multerStorage });

export const addDrink = async (req: Request, res: Response) => {
  req.uploadTarget = "boisson";
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

    const { name, price, outOfStock, visible } = req.body;
    const image = `uploads/boisson/${req.file?.filename}` || "";

    try {
      const drinks = await Drink.create({
        name,
        price,
        image,
        outOfStock,
        visible,
        restaurantId,
      });
      res.status(201).json({
        drinks,
        message: req.t("drink.created"),
      });
    } catch (error) {
      res.status(400).json({
        message: req.t("errors.unknown"),
        error: errorMessage(error),
      });
    }
  });
};

export const getAllDrinks = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const drinks = await Drink.find({ visible: true, restaurantId });
    res.status(200).json(drinks);
  } catch (error) {
    res.status(400).json({
      message: req.t("drink.not_found"),
      error: errorMessage(error),
    });
  }
};

export const getDashboardDrinks = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const drinks = await Drink.find({ restaurantId });
    res.status(200).json(drinks);
  } catch (error) {
    res.status(400).json({
      message: req.t("drink.not_found"),
      error: errorMessage(error),
    });
  }
};

export const deleteDrink = async (req: Request, res: Response) => {
  try {
    const { drinkId } = req.params;
    const { restaurantId } = req;
    const drinks = await Drink.findOne({ _id: drinkId, restaurantId });
    if (drinks?.image) {
      const imagePath = path.join(PROJECT_ROOT, drinks.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Drink.findOneAndDelete({ _id: drinkId, restaurantId });
    res.status(200).json({
      message: req.t("drink.deleted"),
    });
  } catch (error) {
    res.status(400).json({
      message: req.t("drink.not_found"),
      error: errorMessage(error),
    });
  }
};

export const updateDrink = async (req: Request, res: Response) => {
  req.uploadTarget = "boisson";
  const drinkId = req.params.drinkId;
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    const { name, price, outOfStock, visible } = req.body;
    if (err) {
      console.log(err);
      return res.status(500).json({ message: req.t("errors.image_upload_failed") });
    }
    const drink = await Drink.findOne({ _id: drinkId, restaurantId });
    if (!drink) {
      return res.status(500).json({ message: req.t("drink.not_found") });
    }
    if (drink.image) {
      const oldImagePath = path.join(PROJECT_ROOT, drink.image);
      const newImagePath = path.join(
        PROJECT_ROOT,
        "uploads",
        "boisson",
        path.basename(drink.image)
      );

      if (fs.existsSync(oldImagePath)) {
        fs.renameSync(oldImagePath, newImagePath);
      }
      drink.image = `uploads/boisson/${path.basename(drink.image)}`;
    }

    if (req.file) {
      const image = `uploads/boisson/${req.file.filename}`;
      const oldImagePath = path.join(PROJECT_ROOT, drink.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      drink.image = image;
    }
    try {
      await Drink.findOneAndUpdate(
        { _id: drinkId, restaurantId },
        {
          name: name || drink.name,
          price: price || drink.price,
          image: drink.image,
          outOfStock: outOfStock || drink.outOfStock,
          visible: visible || drink.visible,
        },
        {
          new: true,
        }
      );

      res.status(200).json({ message: req.t("drink.updated") });
    } catch (error) {
      res.status(500).json({ message: req.t("errors.unknown"), error: errorMessage(error) });
    }
  });
};
