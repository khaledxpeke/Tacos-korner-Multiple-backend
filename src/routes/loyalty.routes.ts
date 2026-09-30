import { Router } from "express";
import rateLimit from "express-rate-limit";
import { USER_ROLES } from "../enum/constants";
import { authenticate, restaurantAuth, roleAuth } from "../middleware/auth.middleware";
import {
  createSession,
  getSession,
  ledger,
  linkSession,
  login,
  lookupCode,
  me,
  signup,
} from "../controllers/loyalty.controller";

const router = Router();

const customerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const staff = [restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER])];
const customer = [authenticate(), roleAuth([USER_ROLES.CLIENT])];

router.post("/signup", customerLimiter, signup);
router.post("/login", customerLimiter, login);
router.get("/me", ...customer, me);
router.get("/ledger", ...customer, ledger);
router.post("/sessions", ...staff, createSession);
router.get("/sessions/:token", ...staff, getSession);
router.post("/sessions/:token/link", ...customer, linkSession);
router.post("/lookup", lookupLimiter, ...staff, lookupCode);

export default router;
