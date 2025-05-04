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
  const user = await User.findOne({ email: email, restaurantId });
  if (user) {
    return res.status(400).json({ message: "L'utilisateur existe déjà" });
  }
  try {
    bcrypt.hash(password, 10).then(async (hash) => {
      await User.create({
        email,
        password: hash,
        fullName,
        role: "waiter",
        restaurants: [
          {
            restaurantId: restaurantId,
            role: "waiter", 
          },
        ],
      })
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
      bcrypt.compare(password, user.password).then(async function (result) {
        if (result) {
          if (fcmToken) {
            user.fcmToken = fcmToken;
            await user.save();
          }
          const maxAge = 8 * 60 * 60 * 60;
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
    const users = await User.find({ restaurantId }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({
      message: "Une erreur s'est produite",
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
    const user = await User.findOne({ _id: userId, restaurantId }).select(
      "-password"
    );
    res.status(200).json(user);
  }
};

// exports.logout = async (req, res, next) => {
//   res.cookie("jwt", "", { maxAge: 1 });
//   res.redirect("/");
// };

exports.logout = async (req, res) => {
  const userId = req.user.user._id;
  const user = await User.findById(userId);
  user.fcmToken = "";
  await user.save();
  res.status(200).json({ message: "mise à jour du token réussie" });
};
