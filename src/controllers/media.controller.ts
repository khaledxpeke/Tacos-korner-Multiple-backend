import type { Request, Response } from "express";
import mongoose, { type FilterQuery } from "mongoose";
import fs from "fs/promises";
import { Media, type IMedia, type MediaDocument } from "../models/media.model";
import { Product } from "../models/product.model";
import { Category } from "../models/category.model";
import { Ingrediant } from "../models/ingrediant.model";
import { Allergy } from "../models/allergy.model";
import localUpload from "../middleware/localMulter";
import { forwardToMediaBackend } from "../services/media.service";
import { errorMessage } from "../utils/helpers";

const cleanupFiles = async (files: Express.Multer.File[]) => {
  if (files && files.length > 0) {
    await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})));
  }
};

const targetTypeMediaTypes: Record<string, string[]> = {
  Product: ["product", "products"],
  Category: ["category"],
  Ingrediant: ["ingredient", "ingrediants"],
  Allergy: ["allergy_icon", "allergies"],
  Settings: ["banner", "banners"],
  Restaurant: ["logo"],
};

export const addMedia = async (req: Request, res: Response) => {
  const upload = localUpload.array("files", 10);

  upload(req, res, async (err: unknown) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: errorMessage(err),
      });
    }

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: req.t("errors.no_files_uploaded") });
    }

    const tempFiles = req.files;
    const createdMediaDocs: MediaDocument[] = [];

    try {
      const { restaurantId } = req;
      const queryType =
        typeof req.query.type === "string" ? req.query.type : undefined;
      const { targetType, targetId } = req.body as {
        targetType?: string;
        targetId?: string;
      };
      const type =
        targetType === "Settings" && (!queryType || queryType === "image")
          ? "banner"
          : queryType;

      const mediaPromises = tempFiles.map(async (file) => {
        const mediaResponse = await forwardToMediaBackend({
          filePath: file.path,
          restaurantId: restaurantId?.toString(),
          type: type || "image",
          originalname: file.originalname,
        });

        const restaurantIdValue = restaurantId?.toString();
        let mediaDoc = await Media.findOne({
          hash: mediaResponse.hash,
          $or: [
            { scope: "shared" },
            ...(restaurantIdValue
              ? [{ scope: "restaurant" as const, restaurantId: restaurantIdValue }]
              : []),
          ],
        });
        if (!mediaDoc) {
          mediaDoc = new Media({
            filename: mediaResponse.filename || file.originalname,
            url: mediaResponse.url,
            mimeType: mediaResponse.mimeType || file.mimetype,
            size: mediaResponse.size || file.size,
            hash: mediaResponse.hash,
            uploadedBy: req.user?.user?._id,
            targetType: targetType,
            targetId: targetId,
            type: type,
            restaurantId: restaurantIdValue,
            scope: "shared",
          });

          await mediaDoc.save();
          createdMediaDocs.push(mediaDoc);
        } else if (targetType === "Settings") {
          let dirty = false;
          if (!mediaDoc.targetType) {
            mediaDoc.targetType = targetType;
            dirty = true;
          }
          if (targetId && !mediaDoc.targetId) {
            mediaDoc.targetId = targetId;
            dirty = true;
          }
          if (type && mediaDoc.type !== type) {
            mediaDoc.type = type;
            dirty = true;
          }
          if (dirty) {
            await mediaDoc.save();
          }
        }
        return mediaDoc;
      });

      const savedMedia = await Promise.all(mediaPromises);

      await cleanupFiles(tempFiles);

      res.status(201).json(savedMedia);
    } catch (error) {
      await cleanupFiles(tempFiles);
      if (createdMediaDocs.length > 0) {
        await Media.deleteMany({
          _id: { $in: createdMediaDocs.map((d) => d._id) },
        });
      }
      console.error("❌ Add Media Error:", errorMessage(error));
      res
        .status(500)
        .json({ message: req.t("errors.unknown"), error: errorMessage(error) });
    }
  });
};

export const listMedia = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId, q, limit = 50, page = 1, locateId, locateUrl } = req.query;

    const filter: FilterQuery<IMedia> = {};
    const restaurantIdHeader = req.headers["restaurant-id"];
    const restaurantId =
      typeof restaurantIdHeader === "string" ? restaurantIdHeader : undefined;

    const scopeFilter: FilterQuery<IMedia> = restaurantId
      ? {
          $or: [
            { scope: "shared" },
            { scope: "restaurant", restaurantId },
          ],
        }
      : { scope: "shared" };

    const extraFilters: FilterQuery<IMedia>[] = [scopeFilter];

    if (targetType) {
      const typeKey = typeof targetType === "string" ? targetType : String(targetType);
      const mediaTypes = targetTypeMediaTypes[typeKey] || [];
      const orConditions: FilterQuery<IMedia>[] = [{ targetType: typeKey }];

      if (mediaTypes.length > 0) {
        orConditions.push({ type: { $in: mediaTypes } });
      }

      extraFilters.push({ $or: orConditions });
    }

    Object.assign(filter, extraFilters.length === 1 ? extraFilters[0] : { $and: extraFilters });

    if (targetId) {
      filter.targetId = typeof targetId === "string" ? targetId : String(targetId);
    }
    if (q) {
      const query = typeof q === "string" ? q : String(q);
      filter.filename = new RegExp(query, "i");
    }

    const pageSize = Number(limit);
    let currentPage = Number(page);
    let locatedMediaId: string | null = null;
    let locatedDoc: MediaDocument | null = null;

    // Locate the currently selected image even if its type/targetType does
    // not match this picker's filter (legacy banners were stored as "image").
    if (locateId || locateUrl) {
      const rawUrl = locateUrl
        ? String(locateUrl).replace(/\\/g, "/")
        : "";
      const fileName = rawUrl.split("/").pop();
      const escapedUrl = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      locatedDoc =
        locateId && mongoose.isValidObjectId(String(locateId))
          ? await Media.findById(locateId)
          : locateUrl
            ? await Media.findOne({
                $or: [
                  { url: new RegExp(`${escapedUrl}$`, "i") },
                  ...(fileName ? [{ filename: fileName }] : []),
                ],
              })
            : null;

      if (locatedDoc) {
        locatedMediaId = locatedDoc._id.toString();
        const inFilteredList = await Media.findOne({
          _id: locatedDoc._id,
          ...filter,
        });
        if (inFilteredList) {
          const precedingCount = await Media.countDocuments({
            ...filter,
            createdAt: { $gt: locatedDoc.createdAt },
          });
          currentPage = Math.floor(precedingCount / pageSize) + 1;
        }
      }
    }

    const skip = (currentPage - 1) * pageSize;
    const totalCount = await Media.countDocuments(filter);
    const medias = await Media.find(filter)
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(skip)
      .populate("uploadedBy", "name");

    if (
      locatedDoc &&
      !medias.some((item) => item._id.toString() === locatedMediaId)
    ) {
      medias.unshift(locatedDoc);
    }

    res.status(200).json({ medias, totalCount, page: currentPage, locatedMediaId });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

export const listTargetTypes = async (req: Request, res: Response) => {
  try {
    const uniqueTypes = await Media.distinct("targetType", { scope: "shared" });

    const formattedTypes = uniqueTypes
      .filter((type): type is string => Boolean(type))
      .map((type) => ({
        value: type,
        label: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
      }));

    formattedTypes.unshift({ value: "", label: "Tout" });

    res.status(200).json(formattedTypes);
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

export const getMediaById = async (req: Request, res: Response) => {
  try {
    const media = await Media.findById(req.params.id).populate(
      "uploadedBy",
      "name"
    );
    if (!media) {
      return res.status(404).json({ message: req.t("media.not_found") });
    }
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

export const updateMedia = async (req: Request, res: Response) => {
  try {
    const { filename, targetType, targetId } = req.body as {
      filename?: string;
      targetType?: string;
      targetId?: string;
    };
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { filename, targetType, targetId },
      { new: true }
    );

    if (!media) {
      return res.status(404).json({ message: req.t("media.not_found") });
    }
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

export const deleteMedia = async (req: Request, res: Response) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      return res.status(404).json({ message: req.t("media.not_found") });
    }
    if (media.scope === "shared") {
      const usageCount = await Promise.all([
        Product.countDocuments({ image: media._id }),
        Category.countDocuments({ image: media._id }),
        Ingrediant.countDocuments({ image: media._id }),
        Allergy.countDocuments({ icon: media._id }),
      ]);

      const totalUsage = usageCount.reduce((sum, count) => sum + count, 0);

      if (totalUsage > 0) {
        return res.status(400).json({
          message: req.t("media.in_use"),
        });
      }
    }
    await Media.findByIdAndDelete(req.params.id);
    res.status(200).json({
      message: req.t("media.deleted"),
    });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};
