import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  getAllCurrencies,
  getSettings,
  updateDefaultCurrency,
  updateSettings,
} from "../controllers/settings.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.get("/currency", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllCurrencies);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getSettings);
router.put("/currency", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateDefaultCurrency);
router.put("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateSettings);

export default router;
