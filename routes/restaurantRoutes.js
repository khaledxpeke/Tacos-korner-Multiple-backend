const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  createRestaurant,
  getRestaurants,
  getMobileRestaurants,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
  assignUserToRestaurant,
  removeUserFromRestaurant
} = require("../controllers/restaurantController");
const { USER_ROLES } = require("../enum/constants");

router.post("/", roleAuth([USER_ROLES.ADMIN]), createRestaurant);
router.get("/all", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]), getRestaurants);
router.get("/", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]), getMobileRestaurants);
router.get("/:restaurantId", restaurantAuth(), getRestaurantById);
router.put("/:restaurantId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateRestaurant);
router.delete("/:restaurantId", roleAuth([USER_ROLES.ADMIN]), deleteRestaurant);

// Restaurant user management
router.post("/:restaurantId/users", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), assignUserToRestaurant);
router.delete("/:restaurantId/users", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), removeUserFromRestaurant);

module.exports = router;