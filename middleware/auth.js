const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
const User = require("../models/user"); // Ensure User model is imported
const { USER_ROLES, APP_TYPES } = require('../enum/constants');

exports.roleAuth = (expectedRoles) => {
  // ... (roleAuth function remains unchanged)
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.status(401).json({ message: req.t('errors.token_missing') });
    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) return res.status(403).json({ message: req.t('errors.token_invalid') });

      if (!expectedRoles.includes(user.user.role)) {
        return res.status(403).json({ message: req.t('errors.forbidden') });
      }
      req.user = user;
      next();
    });
  };
};

exports.restaurantAuth = () => {
  return async (req, res, next) => {
    try {
      const restaurantIdFromInput = req.params.restaurantId || req.headers["restaurant-id"];
      const appType = req.headers["app-type"]; // Read the new header
      const authorizationHeader = req.headers["authorization"];
      const token = authorizationHeader && authorizationHeader.split(" ")[1];

      // Handle /register route variations
      if (req.path === "/register") {
        if (appType === APP_TYPES.MOBILE || appType === APP_TYPES.BORNE) {
          req.restaurantId = null;
          // console.log(`Registration for ${appType}: bypassing full auth, no restaurantId.`);
          return next();
        } else if (appType === APP_TYPES.DASHBOARD || appType === APP_TYPES.CASHIER || appType === APP_TYPES.DELIVERY || appType === APP_TYPES.KITCHEN) {
          // Staff-facing apps (dashboard, cashier, future delivery/kitchen)
          if (!token) {
            // Case 1: Initial staff registration (e.g., first admin for a restaurant, no existing session)
            // Requires restaurantId in input.
            if (!restaurantIdFromInput) {
              return res.status(400).json({ message: req.t('restaurant.register.restaurant_id_required_initial', { appType }) });
            }
            req.restaurantId = restaurantIdFromInput;
            // console.log(`Initial staff registration for ${appType} (restaurant: ${restaurantIdFromInput}): no token, restaurantId present.`);
            return next();
          }
          // Case 2: Staff registration by an already authenticated staff member (e.g., admin adding waiter).
          // This will fall through to the main token authentication logic below.
          // restaurantIdFromInput will be required and validated there.
        } else {
          // appType is missing or not recognized for /register
          if (!token && restaurantIdFromInput) {
            // Legacy behavior: No appType, no token, but restaurantId is present (assume initial dashboard setup)
            // console.log("Registration with no appType, no token, but with restaurantId (legacy dashboard initial?): proceeding.");
            req.restaurantId = restaurantIdFromInput;
            return next();
          } else if (!token && !restaurantIdFromInput) {
            // No appType, no token, no restaurantId -> invalid for register
            return res.status(400).json({ message: req.t('restaurant.register.incomplete_info') });
          }
          // If appType is missing/unknown but a token is present, it will fall through to general auth.
        }
      }

      // Handle /stream route (as per original logic, if still needed)
      if (req.path === "/stream") {
        req.restaurantId = restaurantIdFromInput || null;
        // console.log("Stream request: bypassing full auth.");
        return next();
      }

      if (!token) {
        return res.status(401).json({ message: req.t('errors.token_missing') });
      }

      jwt.verify(token, jwtSecret, async (err, decoded) => {
        if (err) {
          return res.status(403).json({ message: req.t('errors.token_invalid') });
        }

        req.user = decoded; 

        const userDoc = await User.findById(decoded.user._id);
        if (!userDoc) {
          return res.status(404).json({ message: req.t('errors.user_not_found') });
        }

        if (req.path === "/register") { 
          if (!restaurantIdFromInput) { 
            return res.status(400).json({ message: req.t('restaurant.register.restaurant_id_required_existing') });
          }
        }

    if (decoded.user.role === USER_ROLES.ADMIN) {
      // For admins, restaurant-id is still required for restaurant-specific operations
      if (!restaurantIdFromInput) {
        return res.status(400).json({ 
          message: req.t('errors.restaurant_id_required')
        });
      }
      req.restaurantId = restaurantIdFromInput;
      return next();
    }

    if (decoded.user.role === USER_ROLES.CLIENT) {
      req.restaurantId = restaurantIdFromInput;
      return next();
    }

        if (!restaurantIdFromInput) {
            return res.status(400).json({ message: req.t('errors.restaurant_id_required_for_role', { role: decoded.user.role }) });
        }

        const hasAccess = userDoc.restaurants && userDoc.restaurants.some(
          (r) => r.restaurantId && r.restaurantId.toString() === restaurantIdFromInput
        );

        if (!hasAccess) {
          return res.status(403).json({ message: req.t('errors.not_authorized_for_restaurant') });
        }

        req.restaurantId = restaurantIdFromInput; 
        next();
      });
    } catch (error) {
      console.error("Restaurant auth error:", error);
      res.status(500).json({ message: req.t('restaurant.auth_error'), error: error.message });
    }
  };
};
