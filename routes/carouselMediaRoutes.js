const express = require("express");
const router = express.Router();
const carouselController = require("../controllers/carouselMediaController");
const { roleAuth, restaurantAuth } = require("../middleware/auth");

router.post(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  carouselController.addMedia
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  carouselController.getAllMedia
);
router.get(
  "/stream",
  restaurantAuth(),
  carouselController.getCarouselStream
);
router.put(
  "/order",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  carouselController.updateOrder
);
router.delete(
  "/:id",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  carouselController.deleteMedia
);

module.exports = router;
