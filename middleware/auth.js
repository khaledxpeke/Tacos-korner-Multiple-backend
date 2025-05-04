const jwt = require("jsonwebtoken");
require("dotenv").config();
const jwtSecret = process.env.JWT_SECRET;
const User = require("../models/user");

exports.roleAuth = (expectedRoles) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.status(401).json({ message: "Not authorized" });
    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) return res.status(403).json({ message: "Not authorized" });
      
      if (!expectedRoles.includes(user.user.role)) {
        return res.status(403).json({ message: "Not authorized" });
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
      const restaurantId = req.params.restaurantId || req.headers["restaurant-id"];
      console.log("Restaurant ID:", restaurantId); // Debugging log

      // If the route is "register", skip token validation
      if (req.path === "/register" && !req.headers["authorization"]) {
        console.log("Skipping token validation for register route");
        req.restaurantId = restaurantId || null; // Set restaurantId if provided 
        return next();
      }
     
      if (!restaurantId) {
        return res.status(400).json({ message: "Restaurant ID required" });
      }
      // Authenticate the user for other routes
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];
      
      if (token == null) {
        return res.status(401).json({ message: "No token provided" });
      }

      // Verify token and get user
      jwt.verify(token, jwtSecret, async (err, decoded) => {
        if (err) {
          console.error("Token verification error:", err); // Debugging log
          return res.status(403).json({ message: "Invalid token" });
        }

        // Set the user in the request object
        req.user = decoded;

        // Check if the user has access to this restaurant
        const userDoc = await User.findById(decoded.user._id);

        if (!userDoc) {
          return res.status(404).json({ message: "User not found" });
        }

        // Check if global admin or client - they have access to all restaurants
        if (decoded.user.role === "admin" || decoded.user.role === "client") {
          req.restaurantId = restaurantId;
          return next();
        }

        // For other roles, check if they have this restaurant
        const hasAccess = userDoc.restaurants && userDoc.restaurants.some(
          r => r.restaurantId && r.restaurantId.toString() === restaurantId
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Not authorized for this restaurant" });
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