import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  register,
  login,
  getUsers,
  logout,
  me,
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
  createUser,
} from "../controllers/user.controller";
import { USER_ROLES } from "../enum/constants";
import { roleAuth, restaurantAuth, authenticate } from "../middleware/auth.middleware";

const router = Router();

// Limit brute-force/credential-stuffing attempts against auth endpoints.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

router.post("/register", authRateLimiter, restaurantAuth(), register);
router.post("/create", authRateLimiter, createUser);
router.post("/login", authRateLimiter, login);
router.get("/me", authenticate(), me);
router.post(
  "/:userId/assign",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  assignUserToRestaurant
);
router.delete(
  "/:userId/unassign",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  unassignUserFromRestaurant
);
router.get("/", roleAuth([USER_ROLES.WAITER, USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllUsers);
router.get("/users", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getUsers);
router.get(
  "/users/assignable",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getAssignableUsers
);
router.get("/user", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]), getUserbyId);
router.get("/:userId/restaurants", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getUserRestaurants);
router.put("/:userId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateUser);
router.put("/block/:userId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), blockUser);
router.put("/:userId/notif", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateUserRestaurantNotifications);
router.delete("/:userId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteUser);
router.post("/logout", roleAuth([USER_ROLES.WAITER, USER_ROLES.ADMIN, USER_ROLES.MANAGER]), logout);

export default router;
