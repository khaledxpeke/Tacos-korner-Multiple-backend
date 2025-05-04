const router = require("express").Router();
const {
  register,
  login,
  getUsers,
  logout,
  getUserbyId,
  blockUser,
  updateUser,
  deleteUser
} = require("../controllers/userController");
const { roleAuth,restaurantAuth } = require("../middleware/auth");


router.post("/register", restaurantAuth(),register);
router.post("/login", login);
router.get("/users", restaurantAuth(),roleAuth(["admin","manager"]), getUsers);
router.get("/user",restaurantAuth(), roleAuth(["admin","manager"]), getUserbyId);
router.put("/:userId", restaurantAuth(),roleAuth(["admin","manager",]),updateUser );
router.put("/block/:userId", restaurantAuth(),roleAuth(["admin","manager",]),blockUser );
router.delete("/:userId", restaurantAuth(),roleAuth(["admin","manager",]),deleteUser );
router.post("/logout",roleAuth(["waiter","admin","manager"]), logout);

module.exports = router;
