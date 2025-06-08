const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
const User = require("../models/user"); // Ensure User model is imported

exports.roleAuth = (expectedRoles) => {
  // ... (roleAuth function remains unchanged)
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.status(401).json({ message: "Non autorisé" });
    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) return res.status(403).json({ message: "Non autorisé" });

      if (!expectedRoles.includes(user.user.role)) {
        return res.status(403).json({ message: "Non autorisé" });
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
      const appType = req.headers["x-app-type"]; // Read the new header
      const authorizationHeader = req.headers["authorization"];
      const token = authorizationHeader && authorizationHeader.split(" ")[1];

      // Handle /register route variations
      if (req.path === "/register") {
        if (appType === "client" || appType === "borne") {
          req.restaurantId = null; 
          // console.log(`Registration for ${appType}: bypassing full auth, no restaurantId.`);
          return next();
        } else if (appType === "dashboard" || appType === "cashier" || appType === "delivery" || appType === "kitchen") {
          // Staff-facing apps (dashboard, cashier, future delivery/kitchen)
          if (!token) {
            // Case 1: Initial staff registration (e.g., first admin for a restaurant, no existing session)
            // Requires restaurantId in input.
            if (!restaurantIdFromInput) {
              return res.status(400).json({ message: `Identifiant du restaurant requis pour l'enregistrement initial du personnel via ${appType}.` });
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
            return res.status(400).json({ message: "Informations d'enregistrement incomplètes (type d'application ou identifiant de restaurant manquant)." });
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
        return res.status(401).json({ message: "Aucun jeton fourni pour cette action." });
      }

      jwt.verify(token, jwtSecret, async (err, decoded) => {
        if (err) {
          return res.status(403).json({ message: "Jeton invalide." });
        }

        req.user = decoded; 

        const userDoc = await User.findById(decoded.user._id);
        if (!userDoc) {
          return res.status(404).json({ message: "Utilisateur du jeton non trouvé." });
        }

        if (req.path === "/register") { 
          if (!restaurantIdFromInput) { 
            return res.status(400).json({ message: "Identifiant du restaurant requis lors de l'enregistrement d'un nouvel utilisateur du personnel." });
          }
        }

        if (decoded.user.role === "admin" || decoded.user.role === "client") {
          req.restaurantId = restaurantIdFromInput; 
          return next();
        }

        if (!restaurantIdFromInput) {
            return res.status(400).json({ message: `Identifiant du restaurant requis pour cette action (${decoded.user.role}).` });
        }

        const hasAccess = userDoc.restaurants && userDoc.restaurants.some(
          (r) => r.restaurantId && r.restaurantId.toString() === restaurantIdFromInput
        );

        if (!hasAccess) {
          return res.status(403).json({ message: `Non autorisé pour le restaurant ${restaurantIdFromInput}.` });
        }

        req.restaurantId = restaurantIdFromInput; 
        next();
      });
    } catch (error) {
      console.error("Restaurant auth error:", error);
      res.status(500).json({ message: "Erreur d'authentification du restaurant: " + error.message });
    }
  };
};
