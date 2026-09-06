import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  createCategory,
  getAllCategories,
  getAllCategory,
  updateCategory,
  updatePositions,
  updateCategoryPositions,
  deleteCategory,
} from "../controllers/category.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.get(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  getAllCategories
);
router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), createCategory);
router.get("/all", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllCategory);
router.put("/position", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateCategoryPositions);
router.put("/update/:categoryId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateCategory);
router.put("/position/:categoryId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updatePositions);
router.delete("/:categoryId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteCategory);

export default router;
