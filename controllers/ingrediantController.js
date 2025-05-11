const Ingrediant = require("../models/ingrediant");
const Product = require("../models/product");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
const fs = require("fs");
const { default: mongoose } = require("mongoose");
const path = require("path");

const upload = multer({ storage: multerStorage });

exports.createIngredient = async (req, res, next) => {
  req.uploadTarget = "ingrediants";
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

    const { name, typeIds, price, outOfStock, visible, suppPrice, variations } =
      req.body;
    const userId = req.user.user._id;
    const image = `uploads/ingrediants/${req.file?.filename}` || "";
    try {
      const nameAlreadyExist = await Ingrediant.findOne({
        name: name,
        restaurantId,
      });
      if (nameAlreadyExist) {
        return res.status(400).json({ message: "Ingrediant déja existant" });
      }
      let typesArray = [];
      if (typeIds) {
        typesArray = Array.isArray(typeIds) ? typeIds : JSON.parse(typeIds);

        typesArray = typesArray.map((id) => new mongoose.Types.ObjectId(id));
      }

      let variationsArray = [];
      if (variations) {
        variationsArray = Array.isArray(variations)
          ? variations
          : JSON.parse(variations);
      }
      const ingredient = await Ingrediant.create({
        name,
        image,
        types: typesArray,
        variations: variationsArray || [],
        outOfStock,
        visible,
        suppPrice,
        createdBy: userId,
        restaurantId,
      });
      if (price) {
        ingredient.price = price;
      }
      await ingredient.save();
      res
        .status(201)
        .json({ ingredient, message: "ingrediant créer avec succées" });
    } catch (error) {
      return res.status(400).json({
        message: "Une erreur s'est produite",
        error: error.message,
      });
    }
  });
};

exports.getAllIngrediants = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const ingrediants = await Ingrediant.find({ restaurantId }).populate(
      "types"
    );
    return res.status(200).json(ingrediants);
  } catch (error) {
    return res.status(400).json({
      message: "Aucun ingrediant trouvé",
      error: error.message,
    });
  }
};


exports.updateIngrediant = async (req, res) => {
  const ingrediantId = req.params.ingrediantId;
  req.uploadTarget = "ingrediants";
  const { restaurantId } = req;
  upload.single("image")(req, res, async (err) => {
    const { name, types, price, outOfStock, visible, suppPrice, variations } =
      req.body;
    let variationsArray = [];
    if (variations) {
      variationsArray = Array.isArray(variations)
        ? variations
        : JSON.parse(variations);
    }
    if (err) {
      console.log(err);
return res.status(500).json({ message: "Erreur du serveur" });
    }
    const ingrediant = await Ingrediant.findOne({
      _id: ingrediantId,
      restaurantId,
    });
    if (!ingrediant) {
      return res.status(404).json({ message: "aucun Ingrediant trouvée" });
    }
    if (
      ingrediant.image &&
      !ingrediant.image.startsWith("uploads/ingrediants/")
    ) {
      const oldImagePath = path.join(__dirname, "..", ingrediant.image);
      const newImagePath = path.join(
        __dirname,
        "..",
        "uploads",
        "ingrediants",
        path.basename(ingrediant.image)
      );

      if (fs.existsSync(oldImagePath)) {
        fs.renameSync(oldImagePath, newImagePath);
      }
      ingrediant.image = `uploads/ingrediants/${path.basename(
        ingrediant.image
      )}`;
    }

    if (req.file) {
      const image = `uploads/ingrediants/${req.file.filename}`;
      const oldImagePath = path.join(__dirname, "..", ingrediant.image);

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      ingrediant.image = image;
    }
    try {
      ingrediant.name = name || ingrediant.name;
      ingrediant.types = types || ingrediant.types;
      ingrediant.outOfStock = outOfStock || ingrediant.outOfStock;
      ingrediant.visible = visible || ingrediant.visible;
      ingrediant.suppPrice = suppPrice || ingrediant.suppPrice;
      ingrediant.variations = variationsArray || ingrediant.variations;
      if (price !== undefined) {
        ingrediant.price = price !== "" ? price : null;
      }
      const updatedIngrediant = await ingrediant.save();

      const products = await Product.find({
        ingrediants: ingrediantId,
        restaurantId,
      });

      for (const product of products) {
        const ingrediants = await Promise.all(
          product.ingrediants.map(async (ingrediant) => {
            return await Ingrediant.findOne({ _id: ingrediant, restaurantId });
          })
        );
        const types = ingrediants.map((ingrediant) => ingrediant.types).flat();
        const uniqueTypes = types.reduce((unique, current) => {
          const isDuplicate = unique.some(
            (obj) => obj._id.toString() === current._id.toString()
          );
          if (!isDuplicate) {
            unique.push(current);
          }
          return unique;
        }, []);
        // product.type = uniqueTypes;
        // await product.save();
        await Product.findOneAndUpdate(
          { _id: product._id, restaurantId },
          { type: uniqueTypes }
        );
      }

      return res.status(200).json({ message: "Ingrediant modifié avec succées" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
};

exports.deleteIngredient = async (req, res, next) => {
  const { ingrediantId } = req.params;
  const { restaurantId } = req;
  try {
    const ingrediant = await Ingrediant.findOne({
      _id: ingrediantId,
      restaurantId,
    });

    if (!ingrediant) {
      return res.status(404).json({
        message: "Aucun ingrediant trouvé",
      });
    }
    if (ingrediant.image) {
      const imagePath = path.join(__dirname, "..", ingrediant.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await Ingrediant.deleteOne({ _id: ingrediant._id, restaurantId });

    // Remove the ingredient from the product's ingredients array
    await Product.findOneAndUpdate(
      { _id: ingrediant.product, restaurantId },
      {
        $pull: { ingrediants: ingrediantId },
      }
    );

    return res.status(200).json({
      message: "Ingredient supprimer avec succées",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};
