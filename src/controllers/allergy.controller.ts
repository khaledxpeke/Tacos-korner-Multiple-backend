import type { Request, Response } from "express";
import { Allergy } from "../models/allergy.model";
import { Product } from "../models/product.model";
import { resolveMediaFromRequest } from "../services/media.service";
import localUpload from "../middleware/localMulter";
import { cleanupTempFile } from "../utils/cleanupTempFiles";
import { errorMessage } from "../utils/helpers";

function errorDetail(error: unknown): unknown {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    if (response?.data !== undefined) return response.data;
  }
  return errorMessage(error);
}

export const createAllergy = async (req: Request, res: Response) => {
  const upload = localUpload.single("icon");
  upload(req, res, async (err: unknown) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: errorMessage(err),
      });
    }
    if (!req.file && !req.body.mediaId) {
      return res.status(400).json({
        message: req.t("allergy.add_icon"),
        error: req.t("errors.image_required"),
      });
    }

    let tempFilePath: string | null = null;
    try {
      const { name } = req.body as { name?: string };
      const userId = req.user?.user?._id;

      if (!name) {
        if (req.file) await cleanupTempFile(req.file.path);
        return res.status(400).json({
          message: req.t("allergy.fields_required"),
        });
      }

      const allergy = new Allergy({
        name,
        icon: null,
      });

      await allergy.save();

      if (req.file) {
        tempFilePath = req.file.path;
      }

      const mediaDoc = await resolveMediaFromRequest({
        req,
        userId,
        targetType: "Allergy",
        targetId: allergy._id,
        type: "allergy_icon",
      });

      allergy.icon = mediaDoc!._id;
      await allergy.save();

      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      res.status(201).json({
        allergy,
        message: req.t("allergy.created"),
      });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
      console.error("❌ Error creating allergy:", errorDetail(error));
      res.status(500).json({
        message: req.t("errors.unknown"),
        error: errorMessage(error),
      });
    }
  });
};

export const getAllergies = async (req: Request, res: Response) => {
  try {
    const allergies = await Allergy.find()
      .sort("name")
      .populate({
        path: "icon",
        select: "url",
      })
      .lean()
      .select("name icon");

    const transformedAllergies = allergies.map((allergy) => ({
      ...allergy,
      icon:
        allergy.icon && typeof allergy.icon === "object"
          ? (allergy.icon as { url?: string }).url
          : allergy.icon,
    }));

    res.status(200).json(transformedAllergies);
  } catch (error) {
    console.error("❌ Error fetching allergies:", errorMessage(error));
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

export const updateAllergy = async (req: Request, res: Response) => {
  const upload = localUpload.single("icon");
  upload(req, res, async (err: unknown) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: errorMessage(err),
      });
    }

    let tempFilePath: string | null = null;
    try {
      const { allergyId } = req.params;
      const { name } = req.body as { name?: string };

      const allergy = await Allergy.findById(allergyId);
      if (!allergy) {
        if (req.file) await cleanupTempFile(req.file.path);
        return res.status(404).json({ message: req.t("allergy.not_found") });
      }
      if (name) allergy.name = name;

      if (req.file || req.body.mediaId) {
        if (req.file) {
          tempFilePath = req.file.path;
        }

        const mediaDoc = await resolveMediaFromRequest({
          req,
          userId: req.user?.user?._id,
          targetType: "Allergy",
          targetId: allergy._id,
          type: "allergy_icon",
        });

        allergy.icon = mediaDoc!._id;

        if (tempFilePath) {
          await cleanupTempFile(tempFilePath);
          tempFilePath = null;
        }
      }

      await allergy.save();

      res.status(200).json({
        allergy,
        message: req.t("allergy.updated"),
      });
    } catch (error) {
      if (tempFilePath) await cleanupTempFile(tempFilePath);
      console.error("❌ Error updating allergy:", errorDetail(error));
      res.status(500).json({ message: req.t("errors.unknown") });
    }
  });
};

export const deleteAllergy = async (req: Request, res: Response) => {
  const { allergyId } = req.params;
  try {
    const allergy = await Allergy.findById(allergyId);
    if (!allergy) {
      return res.status(404).json({ message: req.t("allergy.not_found") });
    }

    await Product.updateMany(
      { allergies: allergyId },
      { $pull: { allergies: allergyId } }
    );

    await Allergy.findByIdAndDelete(allergyId);

    res.status(200).json({ message: req.t("allergy.deleted") });
  } catch (error) {
    console.error("❌ Error deleting allergy:", errorMessage(error));
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};
