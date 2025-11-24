const Allergy = require("../models/allergy");
const Product = require("../models/product");
const { forwardToMediaBackend } = require("../utils/mediaHelper");
const localUpload = require("../middleware/localMulter");
const Media = require("../models/media");
const cleanupTempFile = require("../utils/cleanupTempFiles");

exports.createAllergy = async (req, res) => {
  const upload = localUpload.single("icon");
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: req.t("allergy.add_icon"),
        error: req.t("errors.image_required"),
      });
    }

    let tempFilePath = null;
    try {
      const { name } = req.body;
      const userId = req.user?.user?._id;

      if (!name) {
        await cleanupTempFile(req.file.path);
        return res.status(400).json({
          message: req.t("allergy.fields_required"),
        });
      }

      tempFilePath = req.file.path;

      const mediaResponse = await forwardToMediaBackend({
        filePath: tempFilePath,
        type: "allergies",
        originalname: req.file.originalname,
      });

      const allergy = new Allergy({
        name,
        icon: null,
      });

      await allergy.save();

      let mediaDoc = await Media.findOne({ hash: mediaResponse.hash });
      if (!mediaDoc) {
        mediaDoc = new Media({
          filename: mediaResponse.filename || req.file.originalname,
          url: mediaResponse.url,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: userId,
          targetType: "Allergy",
          targetId: allergy._id,
          type: "allergy_icon",
          scope:"shared"
        });
        await mediaDoc.save();
      }

      allergy.icon = mediaDoc._id;
      await allergy.save();

      await cleanupTempFile(tempFilePath);
      tempFilePath = null;

      res.status(201).json({
        allergy,
        message: req.t("allergy.created"),
      });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
      console.error(
        "❌ Error creating allergy:",
        error.response?.data || error.message
      );
      res.status(500).json({
        message: req.t("errors.unknown"),
        error: error.message,
      });
    }
  });
};

exports.getAllergies = async (req, res) => {
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
          ? allergy.icon.url
          : allergy.icon,
    }));

    res.status(200).json(transformedAllergies);
  } catch (error) {
    console.error("❌ Error fetching allergies:", error.message);
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

exports.updateAllergy = async (req, res) => {
  const upload = localUpload.single("icon");
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }

    let tempFilePath = null;
    try {
      const { allergyId } = req.params;
      const { name } = req.body;

      const allergy = await Allergy.findById(allergyId);
      if (!allergy) {
        if (req.file) await cleanupTempFile(req.file.path);
        return res.status(404).json({ message: req.t("allergy.not_found") });
      }
      if (name) allergy.name = name;

      if (req.file) {
        tempFilePath = req.file.path;
        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          type: "allergies",
          originalname: req.file.originalname,
        });

        let mediaDoc = await Media.findOne({ hash: mediaResponse.hash });
        if (!mediaDoc) {
          mediaDoc = new Media({
            filename: mediaResponse.filename || req.file.originalname,
            url: mediaResponse.url,
            mimeType: mediaResponse.mimeType || req.file.mimetype,
            size: mediaResponse.size || req.file.size,
            hash: mediaResponse.hash,
            uploadedBy: req.user?.user?._id,
            targetType: "Allergy",
            targetId: allergy._id,
            type: "allergy_icon",
          });
          await mediaDoc.save();
        }

        allergy.icon = mediaDoc._id;
        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }

      await allergy.save();

      res.status(200).json({
        allergy,
        message: req.t("allergy.updated"),
      });
    } catch (error) {
      if (tempFilePath) await cleanupTempFile(tempFilePath);
      console.error(
        "❌ Error updating allergy:",
        error.response?.data || error.message
      );
      res.status(500).json({ message: req.t("errors.unknown") });
    }
  });
};

exports.deleteAllergy = async (req, res) => {
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
    console.error("❌ Error deleting allergy:", error.message);
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};
