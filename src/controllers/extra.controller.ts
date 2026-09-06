import type { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { Extra } from "../models/extra.model";
import multerStorage from "../middleware/multerStorage";
import { PROJECT_ROOT } from "../config/paths";
import { errorMessage } from "../utils/helpers";

const upload = multer({ storage: multerStorage });

export const addExtra = async (req: Request, res: Response) => {
  req.uploadTarget = "extras";
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
    const userId = req.user?.user._id;
    const image = `uploads/extras\\${req.file?.filename}` || "";

    try {
      const extra = await Extra.create({
        name,
        image,
        price,
        outOfStock,
        visible,
        createdBy: userId,
        restaurantId,
      });
      await extra.save();
      res.status(201).json({ extra, message: req.t("extra.created") });
    } catch (error) {
      res.status(400).json({
        message: req.t("errors.unknown"),
        error: errorMessage(error),
      });
    }
  });
};

export const getExtras = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const extras = await Extra.find({ visible: true, restaurantId });
    res.status(200).json(extras);
  } catch (error) {
    res.status(400).json({
      message: req.t("extra.not_found"),
      error: errorMessage(error),
    });
  }
};

export const getDashboardExtras = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const extras = await Extra.find({ restaurantId });
    res.status(200).json(extras);
  } catch (error) {
    res.status(400).json({
      message: req.t("extra.not_found"),
      error: errorMessage(error),
    });
  }
};

export const updateExtra = async (req: Request, res: Response) => {
  req.uploadTarget = "extras";
  const extraId = req.params.extraId;
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    const { name, price, outOfStock, visible } = req.body;
    if (err) {
      console.log(err);
      return res.status(500).json({ message: req.t("errors.image_upload_failed") });
    }
    const extra = await Extra.findOne({ _id: extraId, restaurantId });
    if (!extra) {
      return res.status(500).json({ message: req.t("extra.not_found") });
    }
    if (extra.image && !extra.image.startsWith("uploads/extras/")) {
      const oldImagePath = path.join(PROJECT_ROOT, extra.image);
      const newImagePath = path.join(
        PROJECT_ROOT,
        "uploads",
        "extras",
        path.basename(extra.image)
      );

      if (fs.existsSync(oldImagePath)) {
        fs.renameSync(oldImagePath, newImagePath);
      }
      extra.image = `uploads/extras/${path.basename(extra.image)}`;
    }

    if (req.file) {
      const image = `uploads/extras/${req.file.filename}`;
      const oldImagePath = path.join(PROJECT_ROOT, extra.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      extra.image = image;
    }
    try {
      await Extra.findOneAndUpdate(
        { _id: extraId, restaurantId },
        {
          name: name || extra.name,
          price: price || extra.price,
          image: extra.image,
          outOfStock: outOfStock || extra.outOfStock,
          visible: visible || extra.visible,
        },
        {
          new: true,
        }
      );

      res.status(200).json({ message: req.t("extra.updated") });
    } catch (error) {
      res.status(500).json({ message: req.t("errors.unknown"), error: errorMessage(error) });
    }
  });
};

export const deleteExtra = async (req: Request, res: Response) => {
  const { extraId } = req.params;
  const { restaurantId } = req;
  try {
    const extra = await Extra.findOne({ _id: extraId, restaurantId });
    if (!extra) {
      return res.status(404).json({
        message: req.t("extra.not_found"),
      });
    }
    if (extra.image) {
      const imagePath = path.join(PROJECT_ROOT, extra.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Extra.findOneAndDelete({ _id: extraId, restaurantId });
    res.status(200).json({
      message: req.t("extra.deleted"),
    });
  } catch (error) {
    res.status(400).json({
      message: req.t("errors.unknown"),
      error: errorMessage(error),
    });
  }
};
