const express = require("express");
const router = express.Router();
const carouselController = require("../controllers/carouselMediaController");
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const { USER_ROLES } = require("../enum/constants");

router.post(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  carouselController.addMedia
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  carouselController.getAllMedia
);
router.get(
  "/stream",
  restaurantAuth(),
  carouselController.getCarouselStream
);
router.get(
  "/test-carousel",
  (req, res, next) => {
    req.restaurantId = '67fa851dd299c52f0945b028';
    next();
  },
  carouselController.getCarouselStream
);
router.put(
  "/order",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  carouselController.updateOrder
);
router.delete(
  "/:id",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  carouselController.deleteMedia
);

module.exports = router;
