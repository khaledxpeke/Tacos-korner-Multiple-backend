const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addVariation,
  getVariations,
  updateVariation,
  deleteVariation,
} = require("../controllers/variationController");

router.post(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  addVariation
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager", "client"]),
  getVariations
);
router.put(
  "/:variationId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  updateVariation
);
router.delete(
  "/:variationId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  deleteVariation
);

module.exports = router;
