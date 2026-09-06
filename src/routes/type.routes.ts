import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  createType,
  getAllTypes,
  getTypeById,
  updateType,
  deleteType,
} from "../controllers/type.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), createType);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllTypes);
router.get("/:typeId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getTypeById);
router.put("/update/:typeId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateType);
router.delete("/:typeId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteType);

export default router;
