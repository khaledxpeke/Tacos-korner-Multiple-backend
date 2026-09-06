import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  addDrink,
  getAllDrinks,
  deleteDrink,
  updateDrink,
  getDashboardDrinks,
} from "../controllers/drink.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addDrink);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllDrinks);
router.get("/all", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getDashboardDrinks);
router.put("/update/:drinkId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateDrink);
router.delete("/:drinkId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteDrink);

export default router;
