const Restaurant = require("../models/restaurant");
const User = require("../models/user");
const Settings = require("../models/settings");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const multerStorage = require("../middleware/multerStorage");
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

const upload = multer({ storage: multerStorage });

exports.createRestaurant = async (req, res) => {
  req.uploadTarget = "restaurant";
  upload.single("logo")(req, res, async (err) => {
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

    const logo = `uploads/restaurant/${req.file?.filename}` || "";

    try {
      const { name, description, address } = req.body;
      if (!name || !description || !address) {
        return res.status(400).json({
          message: "les champs name, description et address sont obligatoires",
        });
      }

      const restaurant = new Restaurant({
        name,
        description,
        address,
        logo,
      });

      await restaurant.save();

      const settings = new Settings({
        restaurantId: restaurant._id,
        tva: 10,
        method: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Espèce",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Carte bancaire",
            isActive: true,
          },
        ],
        currencies: ["€", "$"],
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
      });
      await settings.save();
      restaurant.settings = settings._id;
      await restaurant.save();

      // Add restaurant to admin user
      await User.findByIdAndUpdate(req.user.user._id, {
        $push: {
          restaurants: {
            restaurantId: restaurant._id,
            role: "admin",
          },
        },
      });

      res.status(201).json({
        restaurant,
        message: "Restaurant créé avec succès",
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};

exports.getRestaurants = async (req, res) => {
  try {
    let restaurants;

    if (req.user.user.role === "admin" || req.user.user.role === "client") {
      restaurants = await Restaurant.find().select(
        "name description active createdAt address logo"
      ).populate("settings");
    } else {
      // For managers and waiters, find their specific restaurants
      const user = await User.findById(req.user.user._id);

      if (!user.restaurants || user.restaurants.length === 0) {
        return res.status(200).json([]);
      }

      const restaurantIds = user.restaurants.map((r) => r.restaurantId);
      restaurants = await Restaurant.find({
        _id: { $in: restaurantIds },
      }).select("name description active createdAt address logo").populate("settings");
    }

    res.status(200).json(restaurants);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRestaurantById = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(
      req.params.restaurantId
    ).populate("settings");

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json(restaurant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateRestaurant = async (req, res) => {
  req.uploadTarget = "restaurant";
  upload.single("logo")(req, res, async (err) => {
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

    try {
      const { name, description, active, address } = req.body;
      const existedRestaurant = await Restaurant.findById(
        req.params.restaurantId
      );
      if (!existedRestaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }
      let logo = existedRestaurant.logo;
      if (
        existedRestaurant.logo &&
        !existedRestaurant.logo.startsWith("uploads/restaurant/")
      ) {
        const oldImagePath = path.join(__dirname, "..", existedRestaurant.logo);
        const newImagePath = path.join(
          __dirname,
          "..",
          "uploads",
          "restaurant",
          path.basename(existedRestaurant.logo)
        );

        if (fs.existsSync(oldImagePath)) {
          fs.renameSync(oldImagePath, newImagePath);
        }
        logo = `uploads/restaurant/${path.basename(existedRestaurant.logo)}`;
      }

      // Handle new logo upload
      if (req.file) {
        logo = `uploads/restaurant/${req.file.filename}`;
        const oldImagePath = path.join(__dirname, "..", existedRestaurant.logo);

        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }

        existedRestaurant.logo = logo;
      }

      if (name) existedRestaurant.name = name;
      if (address) existedRestaurant.address = address;
      if (logo) existedRestaurant.logo = logo;
      if (description !== undefined)
        existedRestaurant.description = description;
      if (active !== undefined) existedRestaurant.active = active;

      await existedRestaurant.save();

      res.status(200).json({
        existedRestaurant,
        message: "Restaurant updated successfully",
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};

exports.deleteRestaurant = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    if (restaurant.logo) {
      const imagePath = path.join(__dirname, "..", restaurant.logo);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    // Remove restaurant from all users
    await User.updateMany(
      { "restaurants.restaurantId": restaurant._id },
      { $pull: { restaurants: { restaurantId: restaurant._id } } },
      { session }
    );

    // Delete restaurant settings
    if (restaurant.settings) {
      await Settings.findByIdAndDelete(restaurant.settings).session(session);
    }
    await Product.deleteMany({ restaurantId: restaurant._id }).session(session);

    // Delete all orders associated with the restaurant
    await History.deleteMany({ restaurantId: restaurant._id }).session(session);

    await Category.deleteMany({ restaurantId: restaurant._id }).session(
      session
    );

    await Ingrediant.deleteMany({ restaurantId: restaurant._id }).session(
      session
    );
    await Variation.deleteMany({ restaurantId: restaurant._id }).session(
      session
    );
    await TypeVariation.deleteMany({ restaurantId: restaurant._id }).session(
      session
    );
    await Type.deleteMany({ restaurantId: restaurant._id }).session(session);
    await Desert.deleteMany({ restaurantId: restaurant._id }).session(session);
    await Drink.deleteMany({ restaurantId: restaurant._id }).session(session);
    await Extra.deleteMany({ restaurantId: restaurant._id }).session(session);
    await carouselMedia
      .deleteMany({ restaurantId: restaurant._id })
      .session(session);

    // Delete restaurant
    await Restaurant.findByIdAndDelete(req.params.restaurantId).session(
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Restaurant deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting restaurant:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.assignUserToRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    let usersToProcess = [];

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
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
        message:
          "Invalid request format. Provide either userId+role or an array of users.",
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
          results.failed.push({ userId, message: "User not found" });
          continue;
        }

        // Handle role-specific logic
        if (role === "waiter") {
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
                message: "Role updated successfully",
              });
              continue;
            }

            // If waiter is assigned elsewhere, add to failed results
            results.failed.push({
              userId,
              name: user.fullName,
              message: "Waiters can only be assigned to one restaurant",
            });
            continue;
          }

          // If not assigned anywhere, assign to this restaurant
          await User.findByIdAndUpdate(userId, {
            $set: { restaurants: [{ restaurantId, role }] },
          });
        } else if (role === "manager") {
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
        } else if (role === "admin") {
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
                  role: "admin",
                },
              },
            });
          }
        } else if (role === "client") {
          // Clients don't need restaurant assignments
          results.failed.push({
            userId,
            name: user.fullName,
            message: "Clients don't need restaurant assignments",
          });
          continue;
        }

        // If we got here, the assignment was successful
        results.successful.push({
          userId,
          name: user.fullName,
          role,
          message: "User assigned successfully",
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
          message: "User assigned to restaurant successfully",
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
        message: `${results.successful.length} users assigned successfully, ${results.failed.length} failed`,
        results,
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.removeUserFromRestaurant = async (req, res) => {
  try {
    const { userId } = req.body;
    const { restaurantId } = req.params;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is assigned to this restaurant
    const hasRestaurant = user.restaurants.some(
      (r) => r.restaurantId.toString() === restaurantId
    );

    if (!hasRestaurant) {
      return res.status(404).json({
        message: "User is not assigned to this restaurant",
      });
    }

    // Remove this restaurant from user's assignments
    await User.findByIdAndUpdate(userId, {
      $pull: {
        restaurants: { restaurantId },
      },
    });

    res
      .status(200)
      .json({ message: "User removed from restaurant successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
