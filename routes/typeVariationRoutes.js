const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addTypeVariation,
  getTypeVariations,
  updateTypeVariation,
  deleteTypeVariation,
} = require("../controllers/typeVariationController");
const { USER_ROLES } = require("../enum/constants");

router.post(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  addTypeVariation
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getTypeVariations
);
router.put(
  "/:typeVariationId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  updateTypeVariation
);
router.delete(
  "/:typeVariationId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  deleteTypeVariation
);

module.exports = router;
