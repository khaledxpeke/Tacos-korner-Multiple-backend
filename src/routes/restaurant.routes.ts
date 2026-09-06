import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  createRestaurant,
  getRestaurants,
  getMobileRestaurants,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
  assignUserToRestaurant,
  removeUserFromRestaurant,
} from "../controllers/restaurant.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", roleAuth([USER_ROLES.ADMIN]), createRestaurant);
router.get("/all", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]), getRestaurants);
router.get("/", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]), getMobileRestaurants);
router.get("/:restaurantId", restaurantAuth(), getRestaurantById);
router.put("/:restaurantId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateRestaurant);
router.delete("/:restaurantId", roleAuth([USER_ROLES.ADMIN]), deleteRestaurant);
router.post("/:restaurantId/users", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), assignUserToRestaurant);
router.delete("/:restaurantId/users", roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), removeUserFromRestaurant);

export default router;
