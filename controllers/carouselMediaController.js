const CarouselMedia = require("../models/carouselMedia");
const fs = require("fs").promises;
const path = require("path");
const Settings = require("../models/settings");
const { forwardToMediaBackend } = require("../utils/mediaHelper");
const localUpload = require("../middleware/localMulter");
const Media = require("../models/media");
const url = process.env.CAROUSEL_URL;

exports.addMedia = async (req, res) => {
  const upload = localUpload.array("files", 10);
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: req.t("errors.no_files_uploaded") });
    }
    const tempFilePaths = req.files.map((f) => f.path);
    try {
      const { restaurantId } = req;
      const { duration, mediaType } = req.body;
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
      const startOrder = lastMedia ? parseInt(lastMedia.order) : 0;

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
        tempFilePaths.map((path) => fs.unlink(path).catch(() => {}))
      );

      res.status(201).json(savedMedia);
    } catch (error) {
      if (req.files) {
        await Promise.all(
          tempFilePaths.map((path) => fs.unlink(path).catch(() => {}))
        );
      }
      res.status(500).json({ error: error.message });
    }
  });
};

exports.updateOrder = async (req, res) => {
  try {
    const { items } = req.body;
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
    res.status(500).json({ error: error.message });
  }
};
exports.getAllMedia = async (req, res) => {
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

    const transformedMedia = media.map(item => {
      const itemObj = item.toObject();
      
      if (itemObj.fileUrl && typeof itemObj.fileUrl === 'object') {
        itemObj.fileUrl = itemObj.fileUrl.url || null;
      }
      
      return itemObj;
    });

    res.status(200).json(transformedMedia);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCarouselStream = async (req, res) => {
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
    const mediaBaseUrl = process.env.CAROUSEL_URL || "http://localhost:4000";
    const STATIC_DURATION = settings.carouselDuration || 5;
    const transformedMedia = activeMedia.map(item => {
      const itemObj = item.toObject();
      
      if (itemObj.fileUrl && typeof itemObj.fileUrl === 'object') {
        itemObj.fileUrl = itemObj.fileUrl.url || '';
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
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMedia = async (req, res) => {
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

    await Media.findOneAndDelete({ _id: media.fileUrl, restaurantId })

    res.status(200).json({ message: req.t("carousel.deleted") });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
