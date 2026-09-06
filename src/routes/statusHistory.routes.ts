import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import { getStatusHistory } from "../controllers/statusHistory.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.get(
  "/:historyId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  getStatusHistory
);

export default router;
