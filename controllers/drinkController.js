const Drink = require("../models/drink");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
const fs = require("fs");
const path = require("path");
const { getBlurhashFromImage } = require("../utils/blurhash");

const upload = multer({ storage: multerStorage });
exports.addDrink = async (req, res, next) => {
  req.uploadTarget = "boisson";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    if (err) {
       return res.status(400).json({
        message: req.t('errors.image_upload_failed'),
        error: err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: req.t('product.add_image'),
        error: req.t('errors.image_required'),
      });
    }

    const { name, price, outOfStock, visible } = req.body;
    const image = `uploads/boisson/${req.file?.filename}` || "";
     let imagePreviewHash = null;
      if (image) {
        const imagePath = path.join(__dirname, "..", image);
        imagePreviewHash = await getBlurhashFromImage(imagePath);
      }
    try {
      const drinks = await Drink.create({
        name,
        price,
        image,
        imagePreviewHash,
        outOfStock,
        visible,
        restaurantId,
      });
      res.status(201).json({
        drinks,
        message: req.t('drink.created'),
      });
    } catch (error) {
      res.status(400).json({
        message: req.t('errors.unknown'),
        error: error.message,
      });
    }
  });
};

exports.getAllDrinks = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const drinks = await Drink.find({ visible: true, restaurantId });
    res.status(200).json(drinks);
  } catch (error) {
    res.status(400).json({
      message: req.t('drink.not_found'),
      error: error.message,
    });
  }
};

exports.getDashboardDrinks = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const drinks = await Drink.find({ restaurantId });
    res.status(200).json(drinks);
  } catch (error) {
    res.status(400).json({
      message: req.t('drink.not_found'),
      error: error.message,
    });
  }
};

// exports.getDrinkById = async (req, res, next) => {
//   try {
//     const { drinkId } = req.params;
//     const drink = await Drink.findById(drinkId);
//     res.status(200).json({
//       drink,
//     });
//   } catch (error) {
//     res.status(400).json({
//       message: "Aucun boisson trouvé",
//       error: error.message,
//     });
//   }
// };

exports.deleteDrink = async (req, res, next) => {
  try {
    const { drinkId } = req.params;
    const { restaurantId } = req;
    const drinks = await Drink.findOne({ _id: drinkId, restaurantId });
    if (drinks.image) {
      const imagePath = path.join(__dirname, "..", drinks.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Drink.findOneAndDelete({ _id: drinkId, restaurantId });
    res.status(200).json({
      message: req.t('drink.deleted'),
    });
  } catch (error) {
    res.status(400).json({
      message: req.t('drink.not_found'),
      error: error.message,
    });
  }
};
exports.updateDrink = async (req, res) => {
  req.uploadTarget = "boisson";
  const drinkId = req.params.drinkId;
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    const { name, price, outOfStock, visible } = req.body;
    if (err) {
      console.log(err);
      return res.status(500).json({ message: req.t('errors.image_upload_failed') });
    }
    const drink = await Drink.findOne({ _id: drinkId, restaurantId });
    if (!drink) {
      res.status(500).json({ message: req.t('drink.not_found') });
    }
    if (drink.image) {
      const oldImagePath = path.join(__dirname, "..", drink.image);
      const newImagePath = path.join(
        __dirname,
        "..",
        "uploads",
        "boisson",
        path.basename(drink.image)
      );

      if (fs.existsSync(oldImagePath)) {
        fs.renameSync(oldImagePath, newImagePath);
      }
      drink.image = `uploads/boisson/${path.basename(drink.image)}`;
    }

    if (req.file) {
      const image = `uploads/boisson/${req.file.filename}`;
      const oldImagePath = path.join(__dirname, "..", drink.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      drink.image = image;
      const imagePath = path.join(__dirname, "..", image);
      drink.imagePreviewHash = await getBlurhashFromImage(imagePath);
    }
    try {
      const updatedDrink = await Drink.findOneAndUpdate(
        { _id: drinkId, restaurantId },
        {
          name: name || drink.name,
          price: price || drink.price,
          image: drink.image,
          imagePreviewHash: drink.imagePreviewHash,
          outOfStock: outOfStock || drink.outOfStock,
          visible: visible || drink.visible,
        },
        {
          new: true,
        }
      );

      res.status(200).json({ message: req.t('drink.updated') });
    } catch (error) {
      res.status(500).json({ message: req.t('errors.unknown'), error: error.message });
    }
  });
};
