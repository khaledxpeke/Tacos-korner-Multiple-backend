import { Router } from "express";
import { restaurantAuth, roleAuth } from "../middleware/auth.middleware";
import {
  getCoupon,
  getCoupons,
  addCoupon,
  getCategoriesForCoupons,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
  validateCoupon,
} from "../controllers/coupon.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getCoupons);
router.get("/categories", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getCategoriesForCoupons);
router.get("/:couponId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getCoupon);
router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addCoupon);
router.put("/:couponId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateCoupon);
router.delete("/:couponId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteCoupon);
router.put("/:couponId/toggle", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), toggleCoupon);
router.post("/validate", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), validateCoupon);

export default router;
