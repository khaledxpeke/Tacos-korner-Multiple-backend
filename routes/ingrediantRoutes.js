const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  createIngredient,
  addIngrediantToProduct,
  getIngredientsByType,
  updateIngrediant,
  getIngrediantByProduct,
  deleteIngredient,
  getAllIngrediants,
  getAllIngrediantsByType,
} = require("../controllers/ingrediantController");
const { USER_ROLES } = require("../enum/constants");

router.post(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  createIngredient
);
// router.post("/add/:productId", roleAuth(["admin","manager"]), addIngrediantToProduct);
// router.get("/:productId/ingrediants/:typeId", getIngredientsByType);
router.get(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getAllIngrediants
);
// router.get("/ingrediants", getAllIngrediantsByType);
// router.get("/prod/:productId", getIngrediantByProduct);
router.put(
  "/update/:ingrediantId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  updateIngrediant
);
router.delete(
  "/:ingrediantId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  deleteIngredient
);

module.exports = router;
