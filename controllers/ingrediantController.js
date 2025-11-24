const Ingrediant = require("../models/ingrediant");
const Product = require("../models/product");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const { default: mongoose } = require("mongoose");
const Type = require("../models/type");
const { forwardToMediaBackend } = require("../utils/mediaHelper");
const localUpload = require("../middleware/localMulter");
const Media = require("../models/media");
const cleanupTempFile = require("../utils/cleanupTempFiles");

exports.createIngredient = async (req, res, next) => {
  const upload = localUpload.single("image");
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: err.message,
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: req.t("product.add_image"),
        error: req.t("errors.image_required"),
      });
    }
    const { restaurantId } = req;

    const { name, typeIds, price, outOfStock, visible, suppPrice, variations } =
      req.body;
    const userId = req.user.user._id;
    let tempFilePath = null;
    try {
      const nameAlreadyExist = await Ingrediant.findOne({
        name: name,
        restaurantId,
      });
      if (nameAlreadyExist) {
        await cleanupTempFile(req.file.path);
        return res.status(400).json({ message: req.t("ingrediant.exists") });
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
      tempFilePath = req.file.path;

      const mediaResponse = await forwardToMediaBackend({
        filePath: tempFilePath,
        restaurantId: restaurantId.toString(),
        type: "ingrediants",
        originalname: req.file.originalname,
      });

      let mediaDoc = await Media.findOne({ hash: mediaResponse.hash });
      const ingredient = new Ingrediant({
        name,
        image: null,
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
      if (!mediaDoc) {
        mediaDoc = new Media({
          filename: mediaResponse.filename || req.file.originalname,
          url: mediaResponse.url,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: userId,
          targetType: "Ingrediant",
          targetId: ingredient._id,
          type: "ingredient",
          restaurantId: restaurantId.toString(),
          scope: "shared",
        });
        await mediaDoc.save();
      }

      ingredient.image = mediaDoc._id;
      await ingredient.save();

      await cleanupTempFile(tempFilePath);
      tempFilePath = null;
      res
        .status(201)
        .json({ ingredient, message: req.t("ingrediant.created") });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
      return res.status(400).json({
        message: req.t("product.error"),
        error: error.message,
      });
    }
  });
};

exports.getAllIngrediants = async (req, res) => {
  try {
    const { restaurantId } = req;

    const ingrediants = await Ingrediant.aggregate([
      { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId) } },

      {
        $lookup: {
          from: "media",
          localField: "image",
          foreignField: "_id",
          as: "image",
          pipeline: [{ $project: { url: 1 } }],
        },
      },
      {
        $addFields: {
          image: { $arrayElemAt: ["$image.url", 0] },
        },
      },

      {
        $lookup: {
          from: "types",
          let: { ingrediantId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: [
                    "$$ingrediantId",
                    { $ifNull: ["$ingredients.ingredient", []] },
                  ],
                },
              },
            },
            { $project: { _id: 1, name: 1 } },
          ],
          as: "types",
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(200).json(ingrediants);
  } catch (error) {
    return res.status(400).json({
      message: req.t("ingrediant.not_found"),
      error: error.message,
    });
  }
};

exports.updateIngrediant = async (req, res) => {
  const { restaurantId } = req;
  const ingrediantId = req.params.ingrediantId;
  const upload = localUpload.single("image");
  upload(req, res, async (err) => {
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
      return res.status(500).json({ message: req.t("product.error") });
    }
    let tempFilePath = null;
    try {
      const ingrediant = await Ingrediant.findOne({
        _id: ingrediantId,
        restaurantId,
      });
      if (!ingrediant) {
        return res.status(404).json({ message: req.t("ingrediant.not_found") });
      }

      if (req.file) {
        tempFilePath = req.file.path;
        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: restaurantId.toString(),
          type: "ingrediants",
          originalname: req.file.originalname,
        });

        let newMediaDoc = await Media.findOne({ hash: mediaResponse.hash });

        if (!newMediaDoc) {
          newMediaDoc = new Media({
            filename: mediaResponse.filename || req.file.originalname,
            url: mediaResponse.url,
            mimeType: mediaResponse.mimeType || req.file.mimetype,
            size: mediaResponse.size || req.file.size,
            hash: mediaResponse.hash,
            uploadedBy: req.user?.user?._id,
            targetType: "Ingrediant",
            targetId: ingrediant._id,
            type: "ingredient",
            restaurantId: restaurantId.toString(),
            scope: "shared",
          });
          await mediaDoc.save();
        }

        ingrediant.image = newMediaDoc._id;

        await cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }
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

        await Product.findOneAndUpdate(
          { _id: product._id, restaurantId },
          { type: uniqueTypes }
        );
      }

      return res.status(200).json({ message: req.t("ingrediant.updated") });
    } catch (error) {
      await cleanupTempFile(tempFilePath || req.file?.path);
      return res
        .status(500)
        .json({ message: req.t("product.error"), error: error.message });
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
        message: req.t("ingrediant.not_found"),
      });
    }

    await Ingrediant.deleteOne({ _id: ingrediant._id, restaurantId });

    await Product.findOneAndUpdate(
      { _id: ingrediant.product, restaurantId },
      {
        $pull: { ingrediants: ingrediantId },
      }
    );

    await Type.updateMany(
      { restaurantId },
      { $pull: { ingredients: { ingredient: ingrediant._id } } }
    );

    return res.status(200).json({
      message: req.t("ingrediant.deleted"),
    });
  } catch (error) {
    return res.status(500).json({
      message: req.t("product.error"),
      error: error.message,
    });
  }
};
