import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  createIngredient,
  updateIngrediant,
  deleteIngredient,
  getAllIngrediants,
} from "../controllers/ingrediant.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), createIngredient);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllIngrediants);
router.put(
  "/update/:ingrediantId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  updateIngrediant
);
router.delete("/:ingrediantId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteIngredient);

export default router;
