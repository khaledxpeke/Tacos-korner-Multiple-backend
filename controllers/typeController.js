const Type = require("../models/type");
const Ingrediant = require("../models/ingrediant");
const Product = require("../models/product");
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
app.use(express.json());
const fs = require("fs");
const path = require("path");

exports.createType = async (req, res, next) => {
  const { name, label, message, min, max, payment, selection } = req.body;
  const { restaurantId } = req;

  try {
    const existingType = await Type.findOne({ name, restaurantId });
    if (existingType) {
      return res.status(400).json({ message: "Option existe déja" });
    }
    if (min > max) {
      return res.status(400).json({
        message: "Le minimum doit être inférieur à la maximumu",
      });
    }
    const newType = new Type({
      name,
      label,
      message,
      min,
      max,
      payment,
      selection,
      restaurantId,
    });
    await newType.save();

    res.status(201).json({ message: "Option créer avec succées" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Une erreur s'est produite", error: error.message });
  }
};

exports.getAllTypes = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const types = await Type.find({ restaurantId });
    res.status(200).json(types);
  } catch (error) {
    res.status(400).json({
      message: "Aucun option trouvé",
      error: error.message,
    });
  }
};

exports.getTypeById = async (req, res, next) => {
  try {
    const { typeId } = req.params;
    const { restaurantId } = req;
    const type = await Type.findOne({
      _id: typeId,
      restaurantId: restaurantId,
    });
    if (!type) {
      return res.status(404).json({ message: "Option non trouvée" });
    }
    res.status(200).json(type);
  } catch (error) {
    res.status(400).json({
      message: "Aucun option trouvé",
      error: error.message,
    });
  }
};

exports.updateType = async (req, res, next) => {
  try {
    const { typeId } = req.params;
    const { restaurantId } = req;
    const { name, label, message, min, max, payment, selection } = req.body;
    const type = await Type.findOne({ _id: typeId, restaurantId });
    if (!type) {
      res.status(500).json({ message: "aucun option trouvée" });
    }
    if (min > max) {
      return res.status(400).json({
        message: "Le minimum doit être inférieur à la maximumu",
      });
    }
    const updatedType = await Type.findOneAndUpdate(
      { _id: typeId, restaurantId },
      {
        name,
        label,
        message,
        min,
        max: max || type.max,
        payment: payment || type.payment,
        selection: selection || type.selection,
        restaurantId,
      },
      { new: true }
    );

    res
      .status(200)
      .json({ updatedType, message: "Option modifié avec succées" });
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};

exports.deleteType = async (req, res, next) => {
  try {
    const { typeId } = req.params;
    const { restaurantId } = req;
    const type = await Type.findOne({
      _id: typeId,
      restaurantId: restaurantId,
    });
    if (!type) {
      return res.status(404).json({ message: "Option non trouvée" });
    }

    const ingredients = await Ingrediant.find({ type: typeId, restaurantId });

    await Product.updateMany(
      { ingrediants: { $in: ingredients.map((ingredient) => ingredient._id) },restaurantId },
      {
        $pull: {
          ingrediants: { $in: ingredients.map((ingredient) => ingredient._id) },
        },
      }
    );

    for (const ingredient of ingredients) {
      if (ingredient.image) {
        const imagePath = path.join(__dirname, "..", ingredient.image);
        fs.unlinkSync(imagePath);
      }
    }
    await Type.findOneAndDelete({ _id: typeId, restaurantId });
    await Ingrediant.deleteMany({ type: typeId, restaurantId });

    await Product.updateMany({ type: typeId, restaurantId }, { $pull: { type: typeId } });
    res.status(200).json({ message: "Option supprimer avec succées" });
  } catch (error) {
    res.status(400).json({
      message: "Aucun option trouvé",
      error: error.message,
    });
  }
};
