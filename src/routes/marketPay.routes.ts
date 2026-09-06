import { Router } from "express";
import { handleSSOPermission } from "../controllers/marketPay.controller";

const router = Router();

router.post("/marketpay", handleSSOPermission);

export default router;
