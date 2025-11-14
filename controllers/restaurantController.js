const Restaurant = require("../models/restaurant");
const User = require("../models/user");
const Settings = require("../models/settings");
const mongoose = require("mongoose");
const fs = require("fs").promises;
const Category = require("../models/category");
const carouselMedia = require("../models/carouselMedia");
const Product = require("../models/product");
const History = require("../models/History");
const Ingrediant = require("../models/ingrediant");
const Variation = require("../models/variation");
const TypeVariation = require("../models/typeVariations");
const Type = require("../models/type");
const Desert = require("../models/desert");
const Extra = require("../models/extra");
const Drink = require("../models/drink");
const { USER_ROLES } = require("../enum/constants");
const localUpload = require("../middleware/localMulter");
const { forwardToMediaBackend } = require("../utils/mediaHelper");
const Media = require("../models/media");

exports.createRestaurant = async (req, res) => {
  const upload = localUpload.single("logo");
  upload(req, res, async (err) => {
    if (err) {
      return res
        .status(400)
        .json({ message: "Image upload failed", error: err.message });
    }
    let tempFilePath = null;
    try {
      const { name, description, address } = req.body;
      if (!name || !description || !address) {
        return res.status(400).json({
          message: req.t("restaurant.fields_required"),
        });
      }

      const restaurant = new Restaurant({
        name,
        description,
        address,
        logo: "",
      });

      await restaurant.save();

      if (req.file) {
        tempFilePath = req.file.path;
        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: restaurant._id.toString(),
          type: "logos",
          originalname: req.file.originalname,
        });

        const mediaDoc = new Media({
          filename: req.file.originalname,
          url: mediaResponse.url,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: req.user?.user?._id,
          targetType: "restaurant",
          targetId: restaurant._id,
        });
        await mediaDoc.save();

        restaurant.logo = mediaResponse.url;
        await restaurant.save();

        try {
        await fs.unlink(tempFilePath);
        } catch (cleanupErr) {
          console.error("Error deleting temp file:", cleanupErr);
        }
        tempFilePath = null;
      }
      const settings = new Settings({
        restaurantId: restaurant._id,
        tva: 10,
        method: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Carte bancaire",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Espèce",
            isActive: true,
          },
        ],
        defaultCurrency: "€",
        maxExtras: 5,
        maxDessert: 5,
        maxDrink: 5,
        pack: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Sur Place",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "À emporter",
            isActive: true,
          },
        ],
        carouselDuration: 5,
        carouselTiming: 120,
        qrCode: "https://www.google.com",
        host: process.env.EMAIL_HOST || "smtp.example.com",
        port: process.env.EMAIL_PORT || 587,
        emailUser: process.env.EMAIL_USER || "",
        emailPass: process.env.EMAIL_PASSWORD || "",
        emailSender: process.env.EMAIL_SENDER || "",
        emailName: process.env.EMAIL_NAME || "Restaurant",
        printerServerUrl: process.env.PRINTER_SERVER_URL || "",
      });
      await settings.save();
      restaurant.settings = settings._id;
      await restaurant.save();

      await User.findByIdAndUpdate(req.user.user._id, {
        $push: {
          restaurants: {
            restaurantId: restaurant._id,
            role: USER_ROLES.ADMIN,
          },
        },
      });

      res.status(201).json({
        restaurant,
        message: req.t("restaurant.created"),
      });
    } catch (error) {
      // Cleanup on error
      if (req.file) {
        try {
        await fs.access(req.file.path); 
        await fs.unlink(req.file.path);
        } catch (cleanupErr) {
          console.error("Error deleting temp file:", cleanupErr);
        }
      }
      console.error("❌ Error:", error.response?.data || error.message);
      res.status(500).json({ message: error.message });
    }
  });
};

exports.getRestaurants = async (req, res) => {
  try {
    let restaurants;

    if (
      req.user.user.role === USER_ROLES.ADMIN ||
      req.user.user.role === USER_ROLES.CLIENT
    ) {
      restaurants = await Restaurant.find()
        .select("name description active createdAt address logo")
        .populate("settings");
    } else {
      // For managers and waiters, find their specific restaurants
      const user = await User.findById(req.user.user._id);

      if (!user.restaurants || user.restaurants.length === 0) {
        return res.status(200).json([]);
      }

      const restaurantIds = user.restaurants.map((r) => r.restaurantId);
      restaurants = await Restaurant.find({
        _id: { $in: restaurantIds },
      })
        .select("name description active createdAt address logo")
        .populate("settings");
    }

    res.status(200).json(restaurants);
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

exports.getMobileRestaurants = async (req, res) => {
  try {
    let restaurants;

    if (
      req.user.user.role === USER_ROLES.ADMIN ||
      req.user.user.role === USER_ROLES.CLIENT
    ) {
      restaurants = await Restaurant.find({ active: true })
        .select("name description active createdAt address logo")
        .populate("settings");
    } else {
      // For managers and waiters, find their specific restaurants
      const user = await User.findById(req.user.user._id);

      if (!user.restaurants || user.restaurants.length === 0) {
        return res.status(200).json([]);
      }

      const restaurantIds = user.restaurants.map((r) => r.restaurantId);
      restaurants = await Restaurant.find({
        _id: { $in: restaurantIds },
        active: true,
      })
        .select("name description active createdAt address logo")
        .populate("settings");
    }

    res.status(200).json(restaurants);
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

exports.getRestaurantById = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(
      req.params.restaurantId
    ).populate("settings");

    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    res.status(200).json(restaurant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateRestaurant = async (req, res) => {
  const upload = localUpload.single("logo");
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
    let tempFilePath = null;
    try {
      const { name, description, active, address } = req.body;
      const existedRestaurant = await Restaurant.findById(
        req.params.restaurantId
      );
      if (!existedRestaurant) {
        return res.status(404).json({ message: req.t("restaurant.not_found") });
      }
      if (req.file) {
        tempFilePath = req.file.path;
        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: existedRestaurant._id.toString(),
          type: "logos",
          originalname: req.file.originalname,
        });
         const mediaDoc = new Media({
          filename: req.file.originalname,
          url: mediaResponse.url,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: req.user?.user?._id,
          targetType: "restaurant",
          targetId: existedRestaurant._id,
        });
        await mediaDoc.save();
        existedRestaurant.logo = mediaResponse.url;
         try {
        await fs.unlink(tempFilePath);
        } catch (cleanupErr) {
          console.error("Error deleting temp file:", cleanupErr);
        }
        tempFilePath = null;
      }

      if (name) existedRestaurant.name = name;
      if (address) existedRestaurant.address = address;
      if (description !== undefined)
        existedRestaurant.description = description;
      if (active !== undefined) existedRestaurant.active = active;

      await existedRestaurant.save();

      res.status(200).json({
        existedRestaurant,
        message: req.t("restaurant.updated"),
      });
    } catch (error) {
       if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch {}
      }
      console.error("❌ Update restaurant error:", error.message);
      res.status(500).json({ message: req.t("errors.unknown") });
    }
  });
};

exports.deleteRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    await Promise.all([
      Product.deleteMany({ restaurantId: restaurant._id }),
      History.deleteMany({ restaurantId: restaurant._id }),
      Category.deleteMany({ restaurantId: restaurant._id }),
      Ingrediant.deleteMany({ restaurantId: restaurant._id }),
      Variation.deleteMany({ restaurantId: restaurant._id }),
      TypeVariation.deleteMany({ restaurantId: restaurant._id }),
      Type.deleteMany({ restaurantId: restaurant._id }),
      Desert.deleteMany({ restaurantId: restaurant._id }),
      Drink.deleteMany({ restaurantId: restaurant._id }),
      Extra.deleteMany({ restaurantId: restaurant._id }),
      carouselMedia.deleteMany({ restaurantId: restaurant._id }),
      Settings.findByIdAndDelete(restaurant.settings),
      Restaurant.findByIdAndDelete(req.params.restaurantId),
    ]);

    res.status(200).json({ message: req.t("restaurant.deleted") });
  } catch (error) {
    console.error("Error deleting restaurant:", error);
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

exports.assignUserToRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    let usersToProcess = [];

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    // Handle both single user and multiple users
    if (req.body.users && Array.isArray(req.body.users)) {
      // Multiple users in an array
      usersToProcess = req.body.users;
    } else if (req.body.userId) {
      // Single user as direct properties
      usersToProcess = [
        {
          userId: req.body.userId,
          role: req.body.role,
        },
      ];
    } else {
      return res.status(400).json({
        message: req.t("restaurant.invalid_request"),
      });
    }

    // Track results
    const results = {
      successful: [],
      failed: [],
    };

    // Process each user
    for (const { userId, role } of usersToProcess) {
      try {
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
          results.failed.push({
            userId,
            message: req.t("restaurant.user_not_found"),
          });
          continue;
        }

        // Handle role-specific logic
        if (role === USER_ROLES.WAITER) {
          // For waiters, check if they're already assigned to any restaurant
          if (user.restaurants && user.restaurants.length > 0) {
            // If the waiter is already assigned to this restaurant, just update the role
            if (
              user.restaurants.length === 1 &&
              user.restaurants[0].restaurantId.toString() === restaurantId
            ) {
              await User.updateOne(
                {
                  _id: userId,
                  "restaurants.restaurantId": restaurantId,
                },
                {
                  $set: { "restaurants.$.role": role },
                }
              );
              results.successful.push({
                userId,
                name: user.fullName,
                message: req.t("restaurant.role_updated"),
              });
              continue;
            }

            // If waiter is assigned elsewhere, add to failed results
            results.failed.push({
              userId,
              name: user.fullName,
              message: req.t("restaurant.waiter_single_restaurant"),
            });
            continue;
          }

          // If not assigned anywhere, assign to this restaurant
          await User.findByIdAndUpdate(userId, {
            $set: { restaurants: [{ restaurantId, role }] },
          });
        } else if (role === USER_ROLES.MANAGER) {
          // Managers can be assigned to multiple restaurants
          // Check if already assigned to this restaurant
          const hasRestaurant =
            user.restaurants &&
            user.restaurants.some(
              (r) => r.restaurantId.toString() === restaurantId
            );

          if (hasRestaurant) {
            // Update role if already assigned
            await User.updateOne(
              {
                _id: userId,
                "restaurants.restaurantId": restaurantId,
              },
              {
                $set: { "restaurants.$.role": role },
              }
            );
          } else {
            // Add restaurant to user's list
            await User.findByIdAndUpdate(userId, {
              $push: {
                restaurants: {
                  restaurantId,
                  role,
                },
              },
            });
          }
        } else if (role === USER_ROLES.ADMIN) {
          // Admins have access to all restaurants by default
          // We can add this specific restaurant to their list for clarity
          const hasRestaurant =
            user.restaurants &&
            user.restaurants.some(
              (r) => r.restaurantId.toString() === restaurantId
            );

          if (!hasRestaurant) {
            await User.findByIdAndUpdate(userId, {
              $push: {
                restaurants: {
                  restaurantId,
                  role: USER_ROLES.ADMIN,
                },
              },
            });
          }
        } else if (role === USER_ROLES.CLIENT) {
          // Clients don't need restaurant assignments
          results.failed.push({
            userId,
            name: user.fullName,
            message: req.t("restaurant.client_no_assignment"),
          });
          continue;
        }

        // If we got here, the assignment was successful
        results.successful.push({
          userId,
          name: user.fullName,
          role,
          message: req.t("restaurant.user_assigned"),
        });
      } catch (error) {
        results.failed.push({
          userId,
          message: error.message,
        });
      }
    }

    // Return appropriate response based on number of users processed
    if (usersToProcess.length === 1) {
      // For single user case
      if (results.successful.length === 1) {
        return res.status(200).json({
          message: req.t("restaurant.user_assigned"),
          user: results.successful[0],
        });
      } else {
        return res.status(400).json({
          message: results.failed[0].message,
          details: results.failed[0],
        });
      }
    } else {
      // For multiple users case
      return res.status(200).json({
        message: req.t("restaurant.assignment_results", {
          successful: results.successful.length,
          failed: results.failed.length,
        }),
        results,
      });
    }
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};
exports.removeUserFromRestaurant = async (req, res) => {
  try {
    const { userId } = req.body;
    const { restaurantId } = req.params;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ message: req.t("restaurant.user_not_found") });
    }

    // Check if user is assigned to this restaurant
    const hasRestaurant = user.restaurants.some(
      (r) => r.restaurantId.toString() === restaurantId
    );

    if (!hasRestaurant) {
      return res.status(404).json({
        message: req.t("restaurant.user_not_assigned"),
      });
    }

    // Remove this restaurant from user's assignments
    await User.findByIdAndUpdate(userId, {
      $pull: {
        restaurants: { restaurantId },
      },
    });

    res.status(200).json({ message: req.t("restaurant.user_removed") });
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};
