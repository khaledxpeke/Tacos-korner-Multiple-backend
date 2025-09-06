const Type = require("../models/type");
const Ingrediant = require("../models/ingrediant");
const Product = require("../models/product");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const fs = require("fs");
const path = require("path");

exports.createType = async (req, res, next) => {
  const {
    name,
    label,
    message,
    min,
    max,
    payment,
    selection,
    mode,
    ingredients,
    products,
  } = req.body;
  const { restaurantId } = req;

  try {
    const existingType = await Type.findOne({ name, restaurantId });
    if (existingType) {
      return res.status(400).json({ message: req.t("type.already_exists") });
    }
    if (min > max) {
      return res.status(400).json({
        message: req.t("type.min_max_error"),
      });
    }
    const effectiveMode = mode || "INGREDIENTS";
    const newType = new Type({
      name,
      label,
      message,
      min,
      max,
      payment,
      selection,
      mode: effectiveMode,
      ingredients:
        effectiveMode === "INGREDIENTS"
          ? (Array.isArray(ingredients) ? ingredients : [])
          : [],
      products:
        effectiveMode === "PRODUCTS"
          ? (Array.isArray(products) ? products : [])
          : [],
      restaurantId
    });
    await newType.save();

    res.status(201).json({ message: req.t("type.created") });
  } catch (error) {
    res
      .status(500)
      .json({ message: req.t("type.creation_error"), error: error.message });
  }
};

exports.getAllTypes = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const types = await Type.find({ restaurantId }).populate([
    {
      path: 'ingredients',
      select: 'name' // Selects only the 'name' field for ingredients
    },
    {
      path: 'products',
      select: 'name' // Selects only the 'name' field for products
    }
  ])
    res.status(200).json(types);
  } catch (error) {
    res.status(400).json({
      message: req.t("type.not_found"),
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
      return res.status(404).json({ message: req.t("type.option_not_found") });
    }
    res.status(200).json(type);
  } catch (error) {
    res.status(400).json({
      message: req.t("type.no_option_found"),
      error: error.message,
    });
  }
};

exports.updateType = async (req, res, next) => {
  try {
    const { typeId } = req.params;
    const { restaurantId } = req;
    const {
      name,
      label,
      message,
      min,
      max,
      payment,
      selection,
      mode,
      ingredients,
      products,
    } = req.body;
    const type = await Type.findOne({ _id: typeId, restaurantId });
    if (!type) {
      res.status(500).json({ message: req.t("type.not_found") });
    }
    if (min !== undefined && max !== undefined && min > max) {
      return res.status(400).json({
        message: req.t("type.min_max_error"),
      });
    }
    if (name !== undefined) type.name = name;
    if (label !== undefined) type.label = label;
    if (message !== undefined) type.message = message;
    if (min !== undefined) type.min = min;
    if (max !== undefined) type.max = max;
    if (payment !== undefined) type.payment = payment;
    if (selection !== undefined) type.selection = selection;
    if (mode) {
      type.mode = mode;
      if (mode === "INGREDIENTS") {
        type.products = [];
      } else if (mode === "PRODUCTS") {
        type.ingredients = [];
      }
    }
    if (ingredients !== undefined) {
      type.ingredients = Array.isArray(ingredients) ? ingredients : [];
    }
    if (products !== undefined) {
      type.products = Array.isArray(products) ? products : [];
    }

    await type.save();
    return res.status(200).json({ message: req.t("type.updated"), type });
  } catch (error) {
    res.status(400).json({
      message: req.t("type.update_error"),
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
      return res.status(404).json({ message: req.t("type.option_not_found") });
    }
    await Product.updateMany(
      { type: typeId, restaurantId },
      { $pull: { type: typeId } }
    );

    // (Optional) If you still have ingrediant.types, pull it out
    await Ingrediant.updateMany(
      { types: typeId, restaurantId },
      { $pull: { types: typeId } }
    );

    await Type.deleteOne({ _id: typeId, restaurantId });

    // const ingredients = await Ingrediant.find({ type: typeId, restaurantId });

    // await Product.updateMany(
    //   { ingrediants: { $in: ingredients.map((ingredient) => ingredient._id) },restaurantId },
    //   {
    //     $pull: {
    //       ingrediants: { $in: ingredients.map((ingredient) => ingredient._id) },
    //     },
    //   }
    // );

    // for (const ingredient of ingredients) {
    //   if (ingredient.image) {
    //     const imagePath = path.join(__dirname, "..", ingredient.image);
    //     fs.unlinkSync(imagePath);
    //   }
    // }
    // await Type.findOneAndDelete({ _id: typeId, restaurantId });
    // await Ingrediant.deleteMany({ type: typeId, restaurantId });

    // await Product.updateMany({ type: typeId, restaurantId }, { $pull: { type: typeId } });
    res.status(200).json({ message: req.t("type.deleted") });
  } catch (error) {
    res.status(400).json({
      message: req.t("type.no_option_found"),
      error: error.message,
    });
  }
};
