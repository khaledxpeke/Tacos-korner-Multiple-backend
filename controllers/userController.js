const User = require("../models/user");
const express = require("express");
const app = express();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
app.use(express.json());
const { USER_ROLES, APP_TYPES } = require('../enum/constants');

exports.register = async (req, res, next) => {
  const { email, password, fullName, role: roleFromBody } = req.body; // Added roleFromBody
  const { restaurantId } = req; // restaurantId is set by middleware

  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: req.t('user.already_exists') });
  }

  let determinedUserRole;
  let determinedRestaurantRoleForStaff;

  if (restaurantId) {
    // Staff registration (e.g., from Dashboard)
    const allowedStaffRoles = [USER_ROLES.MANAGER, USER_ROLES.WAITER];
    if (roleFromBody && allowedStaffRoles.includes(roleFromBody)) {
      determinedUserRole = roleFromBody;
      determinedRestaurantRoleForStaff = roleFromBody;
    } else if (roleFromBody) {
      // Role provided but not in allowedStaffRoles
      return res.status(400).json({
        message: req.t('user.invalid_staff_role', { 
          role: roleFromBody, 
          validRoles: allowedStaffRoles.join(", ") 
        }),
      });
    } else {
      // No role provided for staff, default to 'waiter'
      determinedUserRole = USER_ROLES.WAITER;
      determinedRestaurantRoleForStaff = USER_ROLES.WAITER;
    }
  } else {
    // Client registration (e.g., from Client app, Borne app)
    // restaurantId is null due to X-App-Type handling in middleware
    determinedUserRole = USER_ROLES.CLIENT;
  }

  try {
    bcrypt.hash(password, 10).then(async (hash) => {
      const newUser = {
        email,
        password: hash,
        fullName,
        isBlocked: false,
        role: determinedUserRole, // Use the determined role
      };

      if (restaurantId) {
        newUser.restaurants = [
          {
            restaurantId: restaurantId,
            role: determinedRestaurantRoleForStaff, // Use determined role for restaurant association
          },
        ];
      }

      await User.create(newUser)
        .then((createdUser) => { // Renamed user to createdUser to avoid conflict
          const maxAge = 8 * 60 * 60;
          const token = jwt.sign({ id: createdUser._id, email }, jwtSecret, { // Use createdUser
            expiresIn: maxAge,
          });
          res.cookie("jwt", token, {
            httpOnly: true,
            maxAge: maxAge * 1000,
          });
          res.status(201).json({
            user: createdUser, // Use createdUser
            token: token,
          });
        })
        .catch((error) =>
          res.status(400).json({
            // Consider a more generic error message for user creation failure
            message: req.t('user.creation_error'),
            error: error.message,
          })
        );
    });
  } catch (error) { // Catch for bcrypt or other synchronous errors before the .then()
    res.status(400).json({
      message: req.t('user.password_hash_error'),
      error: error.message,
    });
  }
};


exports.login = async (req, res, next) => {
  const { email, password, fcmToken } = req.body;
  const appType = req.headers['app-type'] || req.body.appType;

  if (!email || !password) {
    return res.status(400).json({
      message: req.t('user.invalid_credentials'),
    });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({
        message: req.t('user.not_found'),
        error: req.t('user.not_found'),
      });
    } else {
      const appTypeRoles = {
        mobile: [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER, USER_ROLES.CLIENT],
        borne: [USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.WAITER],
        cashier: [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER],
        dashboard: [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
        // delivery: [...], // add later
        // kitchen: [...], // add later
      };

      if (appType) {
        const allowedRoles = appTypeRoles[appType];
        if (!allowedRoles) {
          return res.status(400).json({
            message: req.t('user.invalid_app_type'),
          });
        }
        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({
            message: req.t('user.unauthorized_for_app', { appType }),
          });
        }
      }
      if (user.isBlocked) {
        return res.status(403).json({
          message: req.t('user.account_blocked'),
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
          if (user.role == USER_ROLES.WAITER) {
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
            .json({ message: req.t('user.invalid_credentials') });
        }
      });
    }
  } catch (error) {
    res.status(400).json({
      message: req.t('user.login_error'),
      error: error.message,
    });
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const users = await User.find({
      restaurants: { $elemMatch: { restaurantId } },
    }).select("-password").sort({ createdAt: -1 });

    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({
      message: req.t('user.get_users_error'),
      error: error.message,
    });
  }
};
exports.getAssignableUsers = async (req, res, next) => {
  try {
    const { restaurantId } = req;
    const { search, role } = req.query;
     const loggedInUserRole = req.user.user.role; // Get the logged-in user's role

     let query = {
      "restaurants.restaurantId": { $ne: restaurantId },
      role: { $nin: [USER_ROLES.ADMIN, USER_ROLES.CLIENT] }, // Exclude admins and clients
    };

    if (loggedInUserRole === USER_ROLES.MANAGER) {
      query.role = { $nin: [USER_ROLES.ADMIN, USER_ROLES.CLIENT, USER_ROLES.MANAGER] };
    }
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
      message: req.t('user.get_users_error'),
      error: error.message,
    });
  }
};

exports.assignUserToRestaurant = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req;
    const { role } = req.body;

    if (![USER_ROLES.MANAGER, USER_ROLES.WAITER].includes(role)) {
      return res.status(400).json({
        message: req.t('user.invalid_role'),
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: req.t('user.not_found') });
    }
 
    user.restaurants.push({ restaurantId, role });
    await user.save();

    res.status(200).json({
      message: req.t('user.assigned_successfully'),
      user,
    });
  } catch (error) {
    console.error("Error in assignUserToRestaurant:", error);
    res.status(500).json({
      message: req.t('user.assignment_error'),
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
      return res.status(404).json({ message: req.t('user.not_found') });
    }

    user.restaurants = user.restaurants.filter(
      (r) => r.restaurantId.toString() !== restaurantId
    );
    await user.save();

    res.status(200).json({
      message: req.t('user.unassigned_successfully'),
      user,
    });
  } catch (error) {
    console.error("Error in unassignUserFromRestaurant:", error);
    res.status(500).json({
      message: req.t('user.unassignment_error'),
      error: error.message,
    });
  }
};

exports.getUserbyId = async (req, res, next) => {
  const userId = req.user.user._id;
  // const { restaurantId } = req;
  if (!userId) {
    res.status(400).json({ message: req.t('user.id_not_found') });
  } else {
    const user = await User.findById(
      userId
      // restaurants: { $elemMatch: { restaurantId } },
    ).select("-password");
    if (!user) {
      return res.status(404).json({ message: req.t('user.not_found') });
    }
    
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
      return res.status(404).json({ message: req.t('user.not_found') });
    }
    const { fullName, email, role } = req.body;
    user.fullName = fullName || user.fullName;
    user.email = email || user.email;

    if (role) { // If a role is being provided for update
      const allowedUpdateRoles = [USER_ROLES.MANAGER, USER_ROLES.WAITER];
      if (allowedUpdateRoles.includes(role)) {
        user.role = role;
        // Also update the role in the user.restaurants array if it's a staff role
        if (user.restaurants && user.restaurants.length > 0) {
          const restaurantIndexOfUser = user.restaurants.findIndex(r => r.restaurantId.toString() === restaurantId); // restaurantId from req
          if (restaurantIndexOfUser !== -1) {
            user.restaurants[restaurantIndexOfUser].role = role;
          }
        }
      } else {
        return res.status(400).json({
          message: req.t('user.invalid_update_role', { validRoles: allowedUpdateRoles.join(", ") }),
        });
      }
    }
    const savedUser = await user.save();
    return res
      .status(200)
      .json({ message: req.t('user.updated_successfully'), savedUser });
  } catch (error) {
    console.error("Erreur dans updateUser:", error);
    return res
      .status(500)
      .json({ message: req.t('user.update_error'), error: error.message });
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
      return res.status(404).json({ message: req.t('user.not_found') });
    }
    if (userRole == USER_ROLES.MANAGER) {
      const user = await User.findOne({
        _id: userId,
        restaurants: { $elemMatch: { restaurantId } },
      }).select("-password");
      if (user.role === USER_ROLES.MANAGER) {
        return res.status(403).json({
          message: req.t('user.cannot_block_admin_manager'),
        });
      }
    }
    user.isBlocked = !user.isBlocked;
    await user.save();
    return res.status(200).json({
      message: req.t('user.blocked_successfully', { 
        action: user.isBlocked ? "bloqué" : "débloqué" 
      }),
    });
  } catch (error) {
    console.error("Error in blockUser:", error);
    return res
      .status(500)
      .json({ message: req.t('user.block_error'), error: error.message });
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
      return res.status(404).json({ message: req.t('user.not_found') });
    }

    return res.status(200).json({ message: req.t('user.deleted_successfully') });
  } catch (error) {
    console.error("Erreur dans deleteUser:", error);
    return res
      .status(500)
      .json({ message: req.t('user.delete_error'), error: error.message });
  }
};

exports.logout = async (req, res) => {
  const userId = req.user.user._id;
  const user = await User.findById(userId);
  user.fcmToken = "";
  await user.save();
  res.status(200).json({ message: req.t('user.token_updated') });
};
