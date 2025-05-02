const Variation = require("../models/variation");
const Ingrediant = require("../models/ingrediant");
const Product = require("../models/product");
const express = require("express");
const TypeVariation = require("../models/typeVariations");
const app = express();
app.use(express.json());

exports.addVariation = async (req, res) => {
  const { name } = req.body;
  const { restaurantId } = req;
  try {
    const variation = new Variation({ name: name, restaurantId });
    await variation.save();
    res.status(201).json(variation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getVariations = async (req, res) => {
  try {
    const { restaurantId } = req;
    const variations = await Variation.find({ restaurantId });
    res.status(200).json(variations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateVariation = async (req, res) => {
  const { variationId } = req.params;
  const { name } = req.body;
  const { restaurantId } = req;

  try {
    const variation = await Variation.findOne({
      _id: variationId,
      restaurantId,
    });
    if (!variation) {
      return res.status(404).json({ message: "Variation not found" });
    }

    variation.name = name;
    await variation.save();

    res.status(200).json({ message: "Variation updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteVariation = async (req, res) => {
  const { variationId } = req.params;
  const { restaurantId } = req;
  try {
    await Variation.findOneAndDelete({ _id: variationId, restaurantId });
    await Ingrediant.updateMany(
      { "variations._id": variationId, restaurantId },
      { $pull: { variations: { _id: variationId } } }
    );
    await Product.updateMany(
      { "typeVariations.variations._id": variationId, restaurantId },
      { $pull: { "typeVariations.variations": { _id: variationId } } }
    );
    await TypeVariation.updateMany(
      { variations: variationId, restaurantId },
      { $pull: { variations: variationId } }
    );
    res.status(200).json({ message: "Variation deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
