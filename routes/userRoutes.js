const router = require("express").Router();
const {
  register,
  login,
  getUsers,
  logout,
  getUserbyId,
  blockUser,
  updateUser,
  deleteUser,
  getAssignableUsers,
  assignUserToRestaurant,
  unassignUserFromRestaurant,
  getUserRestaurants,
  updateUserRestaurantNotifications,
  getAllUsers,
  createUser
} = require("../controllers/userController");
const { USER_ROLES } = require("../enum/constants");
const { roleAuth,restaurantAuth } = require("../middleware/auth");


router.post("/register", restaurantAuth(),register);
router.post("/create", createUser);
router.post("/login", login);
router.post("/:userId/assign", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), assignUserToRestaurant);
router.delete("/:userId/unassign", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), unassignUserFromRestaurant);
router.get("/", roleAuth([USER_ROLES.WAITER, USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllUsers);
router.get("/users", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getUsers);
router.get("/users/assignable", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAssignableUsers);
router.get("/user", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]), getUserbyId);
router.get("/:userId/restaurants", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getUserRestaurants);
router.put("/:userId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),updateUser );
router.put("/block/:userId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),blockUser );
router.put("/:userId/notif", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateUserRestaurantNotifications);
router.delete("/:userId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),deleteUser );
router.post("/logout",roleAuth([USER_ROLES.WAITER, USER_ROLES.ADMIN, USER_ROLES.MANAGER]), logout);

module.exports = router;
