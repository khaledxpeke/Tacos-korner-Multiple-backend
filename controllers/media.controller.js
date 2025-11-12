// controllers/mediaController.js
const Media = require("../models/media");

exports.listMedia = async (req, res) => {
  try {
    const { targetType, targetId, q, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (targetType) filter.targetType = targetType;
    if (targetId) filter.targetId = targetId;
    if (q) filter.filename = new RegExp(q, "i");

    const medias = await Media.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate("uploadedBy", "name"); 

    res.json(medias);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.getMediaById = async (req, res) => {
  try {
    const media = await Media.findById(req.params.id).populate("uploadedBy", "name");
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