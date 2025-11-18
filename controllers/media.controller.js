// controllers/mediaController.js
const Media = require("../models/media");
const fs = require("fs").promises;
const localUpload = require("../middleware/localMulter");
const { forwardToMediaBackend } = require("../utils/mediaHelper");

const cleanupFiles = async (files) => {
  if (files && files.length > 0) {
    await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})));
  }
};

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

    const tempFiles = req.files;
    const createdMediaDocs = [];

    try {
      const { restaurantId } = req;
      const { type } = req.query;
      const { targetType, targetId } = req.body;

      const mediaPromises = tempFiles.map(async (file) => {
        const mediaResponse = await forwardToMediaBackend({
          filePath: file.path,
          restaurantId: restaurantId?.toString(),
          type: type || "image",
          originalname: file.originalname,
        });

        let mediaDoc = await Media.findOne({ hash: mediaResponse.hash });
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
            restaurantId: restaurantId?.toString(),
            scope: "shared",
          });

           await mediaDoc.save();
          createdMediaDocs.push(savedDoc);
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
      console.error("❌ Add Media Error:", error.message);
      res
        .status(500)
        .json({ message: req.t("errors.unknown"), error: error.message });
    }
  });
};

exports.listMedia = async (req, res) => {
  try {
    const { targetType, targetId, q, limit = 50, page = 1 } = req.query;
    
    // 1️⃣ Default filter to show only shared media
    const filter = { scope: "shared" };
    
    if (targetType) filter.targetType = targetType;
    if (targetId) filter.targetId = targetId;
    if (q) filter.filename = new RegExp(q, "i");
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const medias = await Media.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(skip)
      .populate("uploadedBy", "name");

    res.status(200).json(medias);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getMediaById = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id).populate(
      "uploadedBy",
      "name"
    );
    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateMedia = async (req, res) => {
  try {
    const { filename, targetType, targetId } = req.body;
    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { filename, targetType, targetId },
      { new: true }
    );

    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const media = await Media.findByIdAndDelete(req.params.id);
    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }
    res.json({ message: "Media reference deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
