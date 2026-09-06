import { Router } from "express";
import * as allergyController from "../controllers/allergy.controller";
import { roleAuth } from "../middleware/auth.middleware";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", roleAuth([USER_ROLES.ADMIN]), allergyController.createAllergy);
router.get("/", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), allergyController.getAllergies);
router.put("/:allergyId", roleAuth([USER_ROLES.ADMIN]), allergyController.updateAllergy);
router.delete("/:allergyId", roleAuth([USER_ROLES.ADMIN]), allergyController.deleteAllergy);

export default router;
