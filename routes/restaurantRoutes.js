const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  createRestaurant,
  getRestaurants,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
  assignUserToRestaurant,
  removeUserFromRestaurant
} = require("../controllers/restaurantController");

router.post("/", roleAuth(["admin"]), createRestaurant);
router.get("/", roleAuth(["admin", "manager", "waiter"]), getRestaurants);
router.get("/:restaurantId", restaurantAuth(), getRestaurantById);
router.put("/:restaurantId", restaurantAuth(), roleAuth(["admin", "manager"]), updateRestaurant);
router.delete("/:restaurantId", roleAuth(["admin"]), deleteRestaurant);

// Restaurant user management
router.post("/:restaurantId/users", roleAuth(["admin", "manager"]), assignUserToRestaurant);
router.delete("/:restaurantId/users", roleAuth(["admin", "manager"]), removeUserFromRestaurant);

module.exports = router;