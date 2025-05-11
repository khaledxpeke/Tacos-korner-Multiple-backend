const Extra = require("../models/extra");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
const fs = require("fs");
const path = require("path");
const upload = multer({ storage: multerStorage });

exports.addExtra = async (req, res, next) => {
  req.uploadTarget = "extras";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: "Le téléchargement de l'image a échoué",
        error: err.message,
      });
    }

    const { name, price, outOfStock, visible } = req.body;
    const userId = req.user.user._id;
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
      res.status(201).json({ extra, message: "extra créer avec succées" });
    } catch (error) {
      res.status(400).json({
        message: "Une erreur s'est produite",
        error: error.message,
      });
    }
  });
};

exports.getExtras = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const extras = await Extra.find({ visible: true, restaurantId });
    res.status(200).json(extras);
  } catch (error) {
    res.status(400).json({
      message: "Aucune Extra trouvé",
      error: error.message,
    });
  }
};

exports.getDashboardExtras = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const extras = await Extra.find({ restaurantId });
    res.status(200).json(extras);
  } catch (error) {
    res.status(400).json({
      message: "Aucune Extra trouvé",
      error: error.message,
    });
  }
};

// exports.getExtraById = async (req, res, next) => {
//   const { extraId } = req.params;
//   try {
//     const extra = await Extra.findById(extraId);
//     res.status(200).json(extra);
//   } catch (error) {
//     res.status(400).json({
//       message: "Aucune Extra trouvé",
//       error: error.message,
//     });
//   }
// };

exports.updateExtra = async (req, res) => {
  req.uploadTarget = "dessert";
  const extraId = req.params.extraId;
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    const { name, price, outOfStock, visible } = req.body;
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Probleme image" });
    }
    const extra = await Extra.findOne({ _id: extraId, restaurantId });
    if (!extra) {
      res.status(500).json({ message: "aucun Extra trouvée" });
    }
    if (extra.image && !extra.image.startsWith("uploads/extras/")) {
      const oldImagePath = path.join(__dirname, "..", extra.image);
      const newImagePath = path.join(
        __dirname,
        "..",
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
      const oldImagePath = path.join(__dirname, "..", extra.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      extra.image = image;
    }
    try {
      const updatedextra = await Extra.findOneAndUpdate(
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

res.status(200).json({ message: "Extra modifié avec succès" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};

exports.deleteExtra = async (req, res, next) => {
  const { extraId } = req.params;
  const { restaurantId } = req;
  try {
    const extra = await Extra.findOne({ _id: extraId, restaurantId });
    if (!extra) {
      return res.status(404).json({
        message: "il n'y a pas de extra avec cet id",
      });
    }
    if (extra.image) {
      const imagePath = path.join(__dirname, "..", extra.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Extra.findOneAndDelete({ _id: extraId, restaurantId });
    res.status(200).json({
message: "Extra supprimé avec succès",
    });
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};
