const router = require("express").Router();
const { roleAuth } = require("../middleware/auth");
const {
addDrink,
getAllDrinks,
deleteDrink,
getDrinkById,
updateDrink,
getDashboardDrinks
} = require("../controllers/drinkController");

router.post("/", roleAuth(["admin","manager"]), addDrink);
router.get("/", getAllDrinks);
router.get("/all", roleAuth(["admin","manager"]), getDashboardDrinks);
// router.get("/:drinkId", getDrinkById);
router.put("/update/:drinkId", roleAuth(["admin","manager"]), updateDrink);
router.delete("/:drinkId", roleAuth(["admin","manager"]), deleteDrink);


module.exports = router;
