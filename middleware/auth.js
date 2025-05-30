const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
const User = require("../models/user");

exports.roleAuth = (expectedRoles) => {
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
      // Get restaurant ID from params or headers
      const restaurantId =
        req.params.restaurantId || req.headers["restaurant-id"];

      // If the route is "register", skip token validation
      if (
        (req.path === "/register" && !req.headers["authorization"]) ||
        req.path === "/stream"
      ) {
        // console.log("Skipping token validation for register route or carousel stream");
        req.restaurantId = restaurantId || null; // Set restaurantId if provided
        return next();
      }

      if (!restaurantId) {
        return res
          .status(400)
          .json({ message: "Identifiant du restaurant requis" });
      }
      // Authenticate the user for other routes
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];

      if (token == null) {
        return res.status(401).json({ message: "Aucun jeton fourni" });
      }

      // Verify token and get user
      jwt.verify(token, jwtSecret, async (err, decoded) => {
        if (err) {
          console.error("Token verification error:", err); // Debugging log
          return res.status(403).json({ message: "Jeton invalide" });
        }

        // Set the user in the request object
        req.user = decoded;

        // Check if the user has access to this restaurant
        const userDoc = await User.findById(decoded.user._id);

        if (!userDoc) {
          return res.status(404).json({ message: "Utilisateur non trouvé" });
        }

        // Check if global admin or client - they have access to all restaurants
        if (decoded.user.role === "admin" || decoded.user.role === "client") {
          req.restaurantId = restaurantId;
          return next();
        }

        // For other roles, check if they have this restaurant
        const hasAccess =
          userDoc.restaurants &&
          userDoc.restaurants.some(
            (r) => r.restaurantId && r.restaurantId.toString() === restaurantId
          );

        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Non autorisé pour ce restaurant" });
        }

        req.restaurantId = restaurantId;
        next();
      });
    } catch (error) {
      console.error("Restaurant auth error:", error);
      res.status(500).json({ message: error.message });
    }
  };
};
