const router = require("express").Router();
const { restaurantAuth, roleAuth } = require("../middleware/auth");
const {
  getCoupon,
  getCoupons,
  addCoupon,
  getCategoriesForCoupons,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
  validateCoupon,
} = require("../controllers/coupon.controller");
const { USER_ROLES } = require("../enum/constants");

// Coupon CRUD operations
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getCoupons);
router.get(
  "/categories",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getCategoriesForCoupons
);
router.get(
  "/:couponId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getCoupon
);
router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addCoupon);
router.put(
  "/:couponId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  updateCoupon
);
router.delete(
  "/:couponId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  deleteCoupon
);
router.put(
  "/:couponId/toggle",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  toggleCoupon
);

// Coupon validation for orders
router.post(
  "/validate",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  validateCoupon
);

module.exports = router;
