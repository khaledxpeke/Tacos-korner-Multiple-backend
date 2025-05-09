const User = require("../models/user");
const express = require("express");
const app = express();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
app.use(express.json());

exports.register = async (req, res, next) => {
  const { email, password, fullName } = req.body;
  const { restaurantId } = req;
  const user = await User.findOne({ email });
  if (user) {
    return res.status(400).json({ message: "L'utilisateur existe déjà" });
  }
  try {
    bcrypt.hash(password, 10).then(async (hash) => {
      const newUser = {
        email,
        password: hash,
        fullName,
        isBlocked: false,
        role: restaurantId ? "waiter" : "client",
      };
      if (restaurantId) {
        newUser.restaurants = [
          {
            restaurantId: restaurantId,
            role: "waiter",
          },
        ];
      }
      await User.create(newUser)
        .then((user) => {
          const maxAge = 8 * 60 * 60;
          const token = jwt.sign({ id: user._id, email }, jwtSecret, {
            expiresIn: maxAge,
          });
          res.cookie("jwt", token, {
            httpOnly: true,
            maxAge: maxAge * 1000,
          });
          res.status(201).json({
            user: user,
            token: token,
          });
        })
        .catch((error) =>
          res.status(400).json({
            message: "Ce nom existe déjà",
            error: error.message,
          })
        );
    });
  } catch {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};

exports.login = async (req, res, next) => {
  const { email, password, fcmToken } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "L'email ou le mot de passe est incorrect !",
    });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({
        message: "Utilisateur non trouvé",
        error: "Utilisateur non trouvé",
      });
    } else {
      if (user.isBlocked) {
        return res.status(403).json({
          message:
            "Votre compte a été bloqué. Veuillez contacter l'administrateur.",
          error: "Compte bloqué",
        });
      }
      bcrypt.compare(password, user.password).then(async function (result) {
        if (result) {
          if (fcmToken) {
            user.fcmToken = fcmToken;
            await user.save();
          }
          let maxAge = 8 * 60 * 60 * 60;
          if (user.role == "waiter") {
            maxAge = 30 * 24 * 60 * 60;
          }
          const tokenPayload = {
            user: user,
          };
          const token = jwt.sign(tokenPayload, jwtSecret, {
            expiresIn: maxAge, // 8hrs in sec
          });
          res.cookie("jwt", token, {
            httpOnly: true,
            maxAge: maxAge * 1000, // 8hrs in ms
          });
          res.status(201).json({
            token: token,
          });
        } else {
          res
            .status(400)
            .json({ message: "L'email ou le mot de passe est incorrect !" });
        }
      });
    }
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const users = await User.find({
      restaurants: { $elemMatch: { restaurantId } },
    }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};
exports.getAssignableUsers = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const { search, role } = req.query;

    let query = {
      "restaurants.restaurantId": { $ne: restaurantId },
      role: { $ne: "admin" },
    };

    // Filter by role
    if (role) {
      query["role"] = role;
    }

    // Search by name or email
    if (search) {
      query["$or"] = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query).select("-password");

    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
      error: error.message,
    });
  }
};

exports.assignUserToRestaurant = async (req, res, next) => {
  try {
    const { userId } = req.params; 
    const { restaurantId } = req; 
    const { role } = req.body;

    if (!["manager", "waiter"].includes(role)) {
      return res.status(400).json({
        message: "Le rôle doit être 'manager' ou 'waiter'",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    user.restaurants.push({ restaurantId, role });
    await user.save();

    res.status(200).json({
      message: "Utilisateur assigné au restaurant avec succès",
      user,
    });
  } catch (error) {
    console.error("Error in assignUserToRestaurant:", error);
    res.status(500).json({
      message: "Erreur du serveur",
      error: error.message,
    });
  }
};
exports.unassignUserFromRestaurant = async (req, res, next) => {
  try {
    const { userId } = req.params; 
    const { restaurantId } = req; 


    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    user.restaurants = user.restaurants.filter(
      (r) => r.restaurantId.toString() !== restaurantId
    );
    await user.save();

    res.status(200).json({
      message: "Utilisateur désassigné du restaurant avec succès",
      user,
    });
  } catch (error) {
    console.error("Error in unassignUserFromRestaurant:", error);
    res.status(500).json({
      message: "Erreur du serveur",
      error: error.message,
    });
  }
};

exports.getUserbyId = async (req, res, next) => {
  const userId = req.user.user._id;
  const { restaurantId } = req;
  if (!userId) {
    res.status(400).json({ message: " Id non trouvée" });
  } else {
    const user = await User.findOne({
      _id: userId,
      restaurants: { $elemMatch: { restaurantId } },
    }).select("-password");
    res.status(200).json(user);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req;
    const user = await User.findOne({
      _id: userId,
      restaurants: { $elemMatch: { restaurantId } },
    });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }
    const { fullName, email, role } = req.body;
    user.fullName = fullName || user.fullName;
    user.email = email || user.email;
    if (role) {
      // Validate that role is either "manager" or "waiter"
      if (role === "manager" || role === "waiter") {
        user.role = role;
      } else {
        return res.status(400).json({
          message: "Le rôle doit être 'Gérant' ou 'cassier'",
        });
      }
    }
    const savedUser = await user.save();
    return res
      .status(200)
      .json({ message: "Utilisateur modifié avec succès", savedUser });
  } catch (error) {
    console.error("Error in updateUser:", error);
    return res
      .status(500)
      .json({ message: "Erreur du serveur", error: error.message });
  }
};

exports.blockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userRole = req.user.user.role;
    const { restaurantId } = req;
    const user = await User.findOne({
      _id: userId,
      restaurants: { $elemMatch: { restaurantId } },
    }).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }
    if (userRole == "manager") {
      const user = await User.findOne({
        _id: userId,
        restaurants: { $elemMatch: { restaurantId } },
      }).select("-password");
      if (user.role === "manager") {
        return res.status(403).json({
          message:
            "Vous ne pouvez pas bloquer un administrateur ou une autre gérant",
        });
      }
    }
    user.isBlocked = !user.isBlocked;
    await user.save();
    return res.status(200).json({
      message: `Utilisateur ${
        user.isBlocked ? "bloqué" : "débloqué"
      } avec succès`,
    });
  } catch (error) {
    console.error("Error in blockUser:", error);
    return res
      .status(500)
      .json({ message: "Erreur du serveur", error: error.message });
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req;
    const deletedUser = await User.findOneAndDelete({
      _id: userId,
      restaurants: { $elemMatch: { restaurantId } },
    });

    if (!deletedUser) {
      return res.status(404).json({ message: "Utilisateur non trouvée" });
    }

    return res.status(200).json({ message: "Utilisateur supprimée" });
  } catch (error) {
    console.error("Error in deleteUser:", error);
    return res
      .status(500)
      .json({ message: "Erreur du serveur", error: error.message });
  }
};

exports.logout = async (req, res) => {
  const userId = req.user.user._id;
  const user = await User.findById(userId);
  user.fcmToken = "";
  await user.save();
  res.status(200).json({ message: "mise à jour du token réussie" });
};
