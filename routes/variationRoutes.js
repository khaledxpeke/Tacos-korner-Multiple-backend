const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addVariation,
  getVariations,
  updateVariation,
  deleteVariation,
} = require("../controllers/variationController");
const { USER_ROLES } = require("../enum/constants");

router.post(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  addVariation
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.CLIENT]),
  getVariations
);
router.put(
  "/:variationId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  updateVariation
);
router.delete(
  "/:variationId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  deleteVariation
);

module.exports = router;
