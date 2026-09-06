import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  addDesert,
  getAllDeserts,
  updateDesert,
  deleteDesert,
  getDashboardDeserts,
} from "../controllers/desert.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addDesert);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllDeserts);
router.get("/all", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getDashboardDeserts);
router.put("/update/:desertId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateDesert);
router.delete("/:desertId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteDesert);

export default router;
