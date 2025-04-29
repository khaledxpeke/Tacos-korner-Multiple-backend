const Ingrediant = require("../models/ingrediant");
const Product = require("../models/product");
const Type = require("../models/type");
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
app.use(express.json());
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
const fs = require("fs");
const { default: mongoose } = require("mongoose");
const path = require("path");

const upload = multer({ storage: multerStorage });

exports.createIngredient = async (req, res, next) => {
  req.uploadTarget = "ingrediants";
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
      const nameAlreadyExist = await Ingrediant.findOne({ name });
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
      });
      if (price) {
        ingredient.price = price;
      }
      await ingredient.save();
      res
        .status(201)
        .json({ ingredient, message: "ingrediant créer avec succées" });
    } catch (error) {
      res.status(400).json({
        message: "Une erreur s'est produite",
        error: error.message,
      });
    }
  });
};

// exports.addIngrediantToProduct = async (req, res, next) => {
//   try {
//     const { productId } = req.params;
//     const { ingrediantId } = req.body;
//     const product = await Product.findById(productId);
//     if (!product) {
//       return res.status(404).json({
//         message: `Aucun produit trouvé avec cet ID: ${productId}`,
//       });
//     }

//     const ingrediant = await Ingrediant.findById(ingrediantId);
//     if (!ingrediant) {
//       return res.status(404).json({
//         message: `Aucun ingrediant trouvé avec cet ID: ${ingrediantId}`,
//       });
//     }

//     const ingrediantIndex = product.ingrediants.findIndex(
//       (ingrediant) => ingrediant.toString() === ingrediantId
//     );
//     if (ingrediantIndex !== -1) {
//       return res.status(409).json({
//         message: `Ingrediant avec ID ${ingrediantId} déja existant dans le produit`,
//       });
//     }

//     product.ingrediants.push(ingrediant);
//     if (!product.type.some((type) => ingrediant.types.includes(type))) {
//       product.type.push(...ingrediant.types);
//     }
//     await product.save();
//     ingrediant.product.push(productId);
//     await ingrediant.save();
//     res.status(200).json(product);
//   } catch (error) {
//     res.status(500).json({
//       message:
//         "Une erreur s'est produite lors de l'ajout de l'ingrédient au produit",
//       error: error.message,
//     });
//   }
// };
// exports.getIngrediantByProduct = async (req, res, next) => {
//   const { productId } = req.params;
//   try {
//     const ingrediants = await Ingrediant.find({ product: productId }).populate(
//       "types"
//     );
//     res.status(200).json(ingrediants);
//   } catch (error) {
//     res.status(400).json({
//       message: "Aucun ingrediant trouvé",
//       error: error.message,
//     });
//   }
// };

// exports.getIngredientsByType = async (req, res, next) => {
//   const { productId, typeId } = req.params;

//   try {
//     const ingrediants = await Ingrediant.find({
//       product: productId,
//       types: typeId,
//     }).populate("types");
//     res.status(200).json(ingrediants);
//   } catch (error) {
//     res.status(500).json({
//       message: "Une erreur s'est produite",
//       error: error.message,
//     });
//   }
// };

exports.getAllIngrediants = async (req, res, next) => {
  try {
    const ingrediants = await Ingrediant.find().populate("types");
    res.status(200).json(ingrediants);
  } catch (error) {
    res.status(400).json({
      message: "Aucun ingrediant trouvé",
      error: error.message,
    });
  }
};
// exports.getAllIngrediantsByType = async (req, res, next) => {
//   try {
//     const ingrediants = await Ingrediant.find({}, { _id: 1, name: 1 }).populate(
//       "types",
//       { name: 1 }
//     );

//     // Group ingredients by type name
//     const ingrediantsByType = {};
//     ingrediants.forEach((ingrediant) => {
//       const { type } = ingrediant;
//       if (type) {
//         const { name } = type;
//         if (!ingrediantsByType[name]) {
//           ingrediantsByType[name] = [];
//         }
//         ingrediantsByType[name].push({
//           _id: ingrediant._id,
//           name: ingrediant.name,
//           type: ingrediant.type,
//         });
//       }
//     });

//     res.status(200).json(ingrediantsByType);
//   } catch (error) {
//     res.status(400).json({
//       message: "Aucun ingrediant trouvé",
//       error: error.message,
//     });
//   }
// };

exports.updateIngrediant = async (req, res) => {
  const ingrediantId = req.params.ingrediantId;
  req.uploadTarget = "ingrediants";
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
      return res.status(500).json({ message: "Server error" });
    }
    const ingrediant = await Ingrediant.findById(ingrediantId);
    if (!ingrediant) {
      res.status(500).json({ message: "aucun Ingrediant trouvée" });
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

      const products = await Product.find({ ingrediants: ingrediantId });

      for (const product of products) {
        const ingrediants = await Promise.all(
          product.ingrediants.map(async (ingrediant) => {
            return await Ingrediant.findById(ingrediant);
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
        product.type = uniqueTypes;
        await product.save();
      }

      res.status(200).json({ message: "Ingrediant modifié avec succées" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};

exports.deleteIngredient = async (req, res, next) => {
  const { ingrediantId } = req.params;

  try {
    const ingrediant = await Ingrediant.findById(ingrediantId);

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
    await Ingrediant.deleteOne({ _id: ingrediant._id });

    // Remove the ingredient from the product's ingredients array
    await Product.findByIdAndUpdate(ingrediant.product, {
      $pull: { ingrediants: ingrediantId },
    });

    res.status(200).json({
      message: "Ingredient supprimer avec succées",
    });
  } catch (error) {
    res.status(500).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};
