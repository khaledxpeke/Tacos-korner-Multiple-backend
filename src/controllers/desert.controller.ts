import type { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { Desert } from "../models/desert.model";
import multerStorage from "../middleware/multerStorage";
import { PROJECT_ROOT } from "../config/paths";
import { errorMessage } from "../utils/helpers";

const upload = multer({ storage: multerStorage });

export const addDesert = async (req: Request, res: Response) => {
  req.uploadTarget = "dessert";
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
    const image = `uploads/dessert/${req.file?.filename}` || "";

    try {
      const deserts = await Desert.create({
        name,
        price,
        image,
        outOfStock,
        visible,
        restaurantId,
      });
      res.status(201).json({
        deserts,
        message: req.t("desert.created"),
      });
    } catch (error) {
      res.status(400).json({
        message: req.t("product.error"),
        error: errorMessage(error),
      });
    }
  });
};

export const getAllDeserts = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const deserts = await Desert.find({ visible: true, restaurantId });
    res.status(200).json(deserts);
  } catch (error) {
    res.status(400).json({
      message: req.t("desert.not_found"),
      error: errorMessage(error),
    });
  }
};

export const getDashboardDeserts = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const deserts = await Desert.find({ restaurantId });
    res.status(200).json(deserts);
  } catch (error) {
    res.status(400).json({
      message: req.t("desert.not_found"),
      error: errorMessage(error),
    });
  }
};

export const deleteDesert = async (req: Request, res: Response) => {
  try {
    const { desertId } = req.params;
    const { restaurantId } = req;
    const deserts = await Desert.findOne({ _id: desertId, restaurantId });
    if (deserts?.image) {
      const imagePath = path.join(PROJECT_ROOT, deserts.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Desert.findOneAndDelete({ _id: desertId, restaurantId });
    res.status(200).json({
      message: req.t("desert.deleted"),
    });
  } catch (error) {
    res.status(400).json({
      message: req.t("desert.not_found"),
      error: errorMessage(error),
    });
  }
};

export const updateDesert = async (req: Request, res: Response) => {
  req.uploadTarget = "dessert";
  const { restaurantId } = req;
  const desertId = req.params.desertId;
  upload.single("image")(req, res, async (err) => {
    const { name, price, outOfStock, visible } = req.body;
    if (err) {
      console.log(err);
      return res.status(500).json({ message: req.t("errors.image_upload_failed") });
    }
    const desert = await Desert.findOne({ _id: desertId, restaurantId });
    if (!desert) {
      return res.status(500).json({ message: req.t("desert.not_found") });
    }
    if (desert.image && !desert.image.startsWith("uploads/dessert/")) {
      const oldImagePath = path.join(PROJECT_ROOT, desert.image);
      const newImagePath = path.join(
        PROJECT_ROOT,
        "uploads",
        "dessert",
        path.basename(desert.image)
      );

      if (fs.existsSync(oldImagePath)) {
        fs.renameSync(oldImagePath, newImagePath);
      }
      desert.image = `uploads/dessert/${path.basename(desert.image)}`;
    }

    if (req.file) {
      const image = `uploads/dessert/${req.file.filename}`;
      const oldImagePath = path.join(PROJECT_ROOT, desert.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      desert.image = image;
    }
    try {
      await Desert.findOneAndUpdate(
        { _id: desertId, restaurantId },
        {
          name: name || desert.name,
          price: price || desert.price,
          image: desert.image,
          outOfStock: outOfStock || desert.outOfStock,
          visible: visible || desert.visible,
        },
        {
          new: true,
        }
      );

      res.status(200).json({ message: req.t("desert.updated") });
    } catch (error) {
      res.status(500).json({ message: errorMessage(error) });
    }
  });
};
