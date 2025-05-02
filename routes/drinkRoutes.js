const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addDrink,
  getAllDrinks,
  deleteDrink,
  getDrinkById,
  updateDrink,
  getDashboardDrinks,
} = require("../controllers/drinkController");

router.post("/", restaurantAuth(), roleAuth(["admin", "manager"]), addDrink);
router.get("/", restaurantAuth(), roleAuth(["admin", "manager"]), getAllDrinks);
router.get(
  "/all",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getDashboardDrinks
);
// router.get("/:drinkId", getDrinkById);
router.put(
  "/update/:drinkId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  updateDrink
);
router.delete(
  "/:drinkId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  deleteDrink
);

module.exports = router;
