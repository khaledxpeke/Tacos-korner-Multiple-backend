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
const { USER_ROLES } = require("../enum/constants");

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addDrink);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllDrinks);
router.get(
  "/all",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getDashboardDrinks
);
// router.get("/:drinkId", getDrinkById);
router.put(
  "/update/:drinkId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  updateDrink
);
router.delete(
  "/:drinkId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  deleteDrink
);

module.exports = router;
