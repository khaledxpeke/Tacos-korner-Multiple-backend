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

// Coupon CRUD operations
router.get("/", restaurantAuth(), roleAuth(["admin", "manager"]), getCoupons);
router.get(
  "/categories",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getCategoriesForCoupons
);
router.get(
  "/:couponId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getCoupon
);
router.post("/", restaurantAuth(), roleAuth(["admin", "manager"]), addCoupon);
router.put(
  "/:couponId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  updateCoupon
);
router.delete(
  "/:couponId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  deleteCoupon
);
router.put(
  "/:couponId/toggle",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  toggleCoupon
);

// Coupon validation for orders
router.post(
  "/validate",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  validateCoupon
);

module.exports = router;
