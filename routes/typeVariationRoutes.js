const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addTypeVariation,
  getTypeVariations,
  updateTypeVariation,
  deleteTypeVariation,
} = require("../controllers/typeVariationController");

router.post(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  addTypeVariation
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getTypeVariations
);
router.put(
  "/:typeVariationId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  updateTypeVariation
);
router.delete(
  "/:typeVariationId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  deleteTypeVariation
);

module.exports = router;
