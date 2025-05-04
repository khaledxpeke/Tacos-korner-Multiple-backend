const express = require("express");
const router = express.Router();
const { getLargestMedia } = require("../controllers/mediaController");
const { roleAuth, restaurantAuth } = require("../middleware/auth");

router.get(
  "/largest",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getLargestMedia
);

module.exports = router;
