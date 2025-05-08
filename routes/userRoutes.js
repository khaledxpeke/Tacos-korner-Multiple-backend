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
  unassignUserFromRestaurant
} = require("../controllers/userController");
const { roleAuth,restaurantAuth } = require("../middleware/auth");


router.post("/register", restaurantAuth(),register);
router.post("/login", login);
router.post("/:userId/assign", restaurantAuth(),roleAuth(["admin","manager"]), assignUserToRestaurant);
router.delete("/:userId/unassign", restaurantAuth(),roleAuth(["admin","manager"]), unassignUserFromRestaurant);
router.get("/users", restaurantAuth(),roleAuth(["admin","manager"]), getUsers);
router.get("/users/assignable", restaurantAuth(),roleAuth(["admin","manager"]), getAssignableUsers);
router.get("/user",restaurantAuth(), roleAuth(["admin","manager"]), getUserbyId);
router.put("/:userId", restaurantAuth(),roleAuth(["admin","manager",]),updateUser );
router.put("/block/:userId", restaurantAuth(),roleAuth(["admin","manager",]),blockUser );
router.delete("/:userId", restaurantAuth(),roleAuth(["admin","manager",]),deleteUser );
router.post("/logout",roleAuth(["waiter","admin","manager"]), logout);

module.exports = router;
