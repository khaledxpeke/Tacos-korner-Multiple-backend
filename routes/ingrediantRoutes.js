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

router.post(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  createIngredient
);
// router.post("/add/:productId", roleAuth(["admin","manager"]), addIngrediantToProduct);
// router.get("/:productId/ingrediants/:typeId", getIngredientsByType);
router.get(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getAllIngrediants
);
// router.get("/ingrediants", getAllIngrediantsByType);
// router.get("/prod/:productId", getIngrediantByProduct);
router.put(
  "/update/:ingrediantId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  updateIngrediant
);
router.delete(
  "/:ingrediantId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  deleteIngredient
);

module.exports = router;
