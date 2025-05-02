const Desert = require("../models/desert");
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
app.use(express.json());
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
const fs = require("fs");
const path = require("path");

const upload = multer({ storage: multerStorage });

exports.addDesert = async (req, res, next) => {
  req.uploadTarget = "dessert";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: "Le téléchargement de l'image a échoué",
        error: err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: "Ajouter une image",
        error: "Veuillez télécharger une image",
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
        message: "Dessert créer avec succées",
      });
    } catch (error) {
      res.status(400).json({
        message: "Une erreur s'est produite",
        error: error.message,
      });
    }
  });
};

exports.getAllDeserts = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const deserts = await Desert.find({ visible: true, restaurantId });
    res.status(200).json(deserts);
  } catch (error) {
    res.status(400).json({
      message: "Aucun dessert trouvé",
      error: error.message,
    });
  }
};

exports.getDashboardDeserts = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const deserts = await Desert.find({ restaurantId });
    res.status(200).json(deserts);
  } catch (error) {
    res.status(400).json({
      message: "Aucun dessert trouvé",
      error: error.message,
    });
  }
};

// exports.getDesertById = async (req, res, next) => {
//   try {
//     const { desertId } = req.params;
//     const deserts = await Desert.findById(desertId);
//     res.status(200).json({
//       deserts,
//     });
//   } catch (error) {
//     res.status(400).json({
//       message: "Aucun dessert trouvé",
//       error: error.message,
//     });
//   }
// };

exports.deleteDesert = async (req, res, next) => {
  try {
    const { desertId } = req.params;
    const { restaurantId } = req;
    const deserts = await Desert.findOne({ _id: desertId, restaurantId });
    if (deserts.image) {
      const imagePath = path.join(__dirname, "..", deserts.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Desert.findOneAndDelete({ _id: desertId, restaurantId });
    res.status(200).json({
      message: "Dessert supprimé avec succées",
    });
  } catch (error) {
    res.status(400).json({
      message: "Aucun dessert trouvé pour supprimer",
      error: error.message,
    });
  }
};
exports.updateDesert = async (req, res) => {
  req.uploadTarget = "dessert";
  const { restaurantId } = req;
  const desertId = req.params.desertId;
  upload.single("image")(req, res, async (err) => {
    const { name, price, outOfStock, visible } = req.body;
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Probleme image" });
    }
    const desert = await Desert.findOne({ _id: desertId, restaurantId });
    if (!desert) {
      res.status(500).json({ message: "aucun Dessert trouvée" });
    }
    if (desert.image && !desert.image.startsWith("uploads/dessert/")) {
      const oldImagePath = path.join(__dirname, "..", desert.image);
      const newImagePath = path.join(
        __dirname,
        "..",
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
      const oldImagePath = path.join(__dirname, "..", desert.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      desert.image = image;
    }
    try {
      const updatedDesert = await Desert.findOneAndUpdate(
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

      res.status(200).json({ message: "Dessert modifiéer avec succées" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};
