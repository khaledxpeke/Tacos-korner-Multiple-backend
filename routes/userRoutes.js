const router = require("express").Router();
const {
  register,
  login,
  getUsers,
  logout,
  getUserbyId,
} = require("../controllers/userController");
const { roleAuth,restaurantAuth } = require("../middleware/auth");


router.post("/register", restaurantAuth(),register);
router.post("/login", login);
router.get("/users", restaurantAuth(),roleAuth(["admin","manager"]), getUsers);
router.get("/user",restaurantAuth(), roleAuth(["admin","manager"]), getUserbyId);
router.post("/logout",roleAuth(["waiter","admin","manager"]), logout);

module.exports = router;
