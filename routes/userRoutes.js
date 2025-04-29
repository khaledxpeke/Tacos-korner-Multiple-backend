const router = require("express").Router();
const {
  register,
  login,
  getUsers,
  logout,
  getUserbyId,
} = require("../controllers/userController");
const { roleAuth } = require("../middleware/auth");


router.post("/register", register);
router.post("/login", login);
router.get("/users", roleAuth(["admin","manager"]), getUsers);
router.get("/user", roleAuth(["admin","manager"]), getUserbyId);
router.post("/logout",roleAuth(["waiter","admin","manager"]), logout);

module.exports = router;
