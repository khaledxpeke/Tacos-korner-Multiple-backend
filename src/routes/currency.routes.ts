import { Router } from "express";
import * as currencyController from "../controllers/currency.controller";
import { roleAuth } from "../middleware/auth.middleware";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.get("/", roleAuth(USER_ROLES.ADMIN), currencyController.getCurrencies);
router.post("/", roleAuth(USER_ROLES.ADMIN), currencyController.createCurrency);
router.put("/:currencyId", roleAuth(USER_ROLES.ADMIN), currencyController.updateCurrency);
router.delete("/:currencyId", roleAuth(USER_ROLES.ADMIN), currencyController.deleteCurrency);

export default router;
