import type { Request, Response } from "express";
import fs from "fs/promises";
import { CarouselMedia, type ICarouselMedia } from "../models/carouselMedia.model";
import { Settings } from "../models/settings.model";
import { Media } from "../models/media.model";
import { forwardToMediaBackend } from "../services/media.service";
import localUpload from "../middleware/localMulter";
import { env } from "../config/environment";
import { errorMessage } from "../utils/helpers";

type PopulatedFileUrl = { url?: string };

type CarouselItemView = {
  _id?: unknown;
  mediaType: string;
  fileUrl: string | PopulatedFileUrl | null;
  duration?: number;
  filename?: string;
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
    const tempFilePaths = req.files.map((f) => f.path);
    try {
      const { restaurantId } = req;
      const { duration, mediaType } = req.body as {
        duration?: number | string;
        mediaType?: ICarouselMedia["mediaType"];
      };
      if (!restaurantId) {
        await Promise.all(
          req.files.map((f) => fs.unlink(f.path).catch(() => {}))
        );
        return res.status(400).json({ message: "Restaurant ID is required" });
      }
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "video/mp4",
      ];
      const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
      for (const file of req.files) {
        if (!allowedTypes.includes(file.mimetype)) {
          await Promise.all(
            req.files.map((f) => fs.unlink(f.path).catch(() => {}))
          );
          return res.status(400).json({
            message: `Invalid file type: ${file.mimetype}`,
          });
        }

        if (file.mimetype === "video/mp4" && file.size > MAX_VIDEO_SIZE) {
          await Promise.all(
            req.files.map((f) => fs.unlink(f.path).catch(() => {}))
          );
          return res.status(400).json({
            message: `Video ${file.originalname} exceeds 100MB limit`,
          });
        }
      }
      const lastMedia = await CarouselMedia.findOne({ restaurantId }).sort(
        "-order"
      );
      const startOrder = lastMedia ? parseInt(String(lastMedia.order), 10) : 0;

      const savedMedia = await Promise.all(
        req.files.map(async (file, index) => {
          const mediaResponse = await forwardToMediaBackend({
            filePath: file.path,
            restaurantId: restaurantId.toString(),
            type: "carousel",
            originalname: file.originalname,
          });

          const isVideo = file.mimetype.startsWith("video/");
          const carouselMedia = new CarouselMedia({
            mediaType: mediaType || (isVideo ? "video" : "image"),
            fileUrl: null,
            duration: isVideo ? null : duration || 5,
            order: startOrder + index + 1,
            restaurantId,
          });

          const savedCarouselMedia = await carouselMedia.save();

          const mediaDoc = new Media({
            filename: mediaResponse.filename || file.originalname,
            url: mediaResponse.url,
            mimeType: mediaResponse.mimeType || file.mimetype,
            size: mediaResponse.size || file.size,
            hash: mediaResponse.hash,
            uploadedBy: req.user?.user?._id,
            targetType: "CarouselMedia",
            targetId: savedCarouselMedia._id,
            type: "carousel",
            restaurantId: restaurantId.toString(),
            scope: "restaurant",
          });
          await mediaDoc.save();
          savedCarouselMedia.fileUrl = mediaDoc._id;
          await savedCarouselMedia.save();

          return savedCarouselMedia;
        })
      );

      await Promise.all(
        tempFilePaths.map((filePath) => fs.unlink(filePath).catch(() => {}))
      );

      res.status(201).json(savedMedia);
    } catch (error) {
      if (req.files) {
        await Promise.all(
          tempFilePaths.map((filePath) => fs.unlink(filePath).catch(() => {}))
        );
      }
      res.status(500).json({ error: errorMessage(error) });
    }
  });
};

export const updateOrder = async (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: Array<{ id: string; order: number }> };
    const { restaurantId } = req;
    await Promise.all(
      items.map((item) =>
        CarouselMedia.findOneAndUpdate(
          { _id: item.id, restaurantId },
          { order: item.order }
        )
      )
    );

    res.status(200).json({ message: req.t("carousel.order_updated") });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

export const getAllMedia = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const media = await CarouselMedia.find({
      isActive: true,
      restaurantId,
    })
      .sort("order")
      .populate({
        path: "fileUrl",
        select: "url",
      });

    const transformedMedia = media.map((item) => {
      const itemObj = item.toObject() as CarouselItemView;

      if (itemObj.fileUrl && typeof itemObj.fileUrl === "object") {
        itemObj.fileUrl = itemObj.fileUrl.url || null;
      }

      return itemObj;
    });

    res.status(200).json(transformedMedia);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

export const getCarouselStream = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const activeMedia = await CarouselMedia.find({
      isActive: true,
      restaurantId,
    })
      .sort("order")
      .populate({
        path: "fileUrl",
        select: "url",
      })
      .select("mediaType fileUrl duration filename");
    const settings = await Settings.findOne({ restaurantId });
    const mediaBaseUrl = env.carouselUrl || "http://localhost:4000";
    const STATIC_DURATION = settings!.carouselDuration || 5;
    const transformedMedia = activeMedia.map((item) => {
      const itemObj = item.toObject() as CarouselItemView;

      if (itemObj.fileUrl && typeof itemObj.fileUrl === "object") {
        itemObj.fileUrl = itemObj.fileUrl.url || "";
      }
      if (!itemObj.fileUrl) {
        console.warn(`Media item ${itemObj._id} has no fileUrl after population`);
      }

      return itemObj;
    });
    res.render("carousel-viewer", {
      media: transformedMedia,
      mediaDurations: transformedMedia.map(() => STATIC_DURATION).join(","),
      mediaTypes: transformedMedia.map((m) => m.mediaType),
      apiUrl: mediaBaseUrl,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

export const deleteMedia = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const media = await CarouselMedia.findOne({
      _id: req.params.id,
      restaurantId,
    });
    if (!media) {
      return res.status(404).json({ message: req.t("carousel.not_found") });
    }

    await CarouselMedia.findOneAndDelete({ _id: req.params.id, restaurantId });

    await Media.findOneAndDelete({ _id: media.fileUrl, restaurantId });

    res.status(200).json({ message: req.t("carousel.deleted") });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
