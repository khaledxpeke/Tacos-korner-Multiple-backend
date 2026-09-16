import { Router } from "express";
import * as mediaController from "../controllers/media.controller";
import { restaurantAuth, roleAuth } from "../middleware/auth.middleware";
import { USER_ROLES } from "../enum/constants";

const router = Router();

// Reads stay open: uploaded images/videos are displayed unauthenticated in
// public-facing menus/carousels, so they can't require a session.
router.get("/", mediaController.listMedia);
router.get("/types", mediaController.listTargetTypes);
router.get("/:id", mediaController.getMediaById);

// Uploads stay restaurant-scoped. Rename/delete authenticate by role only so
// ADMIN can manage the global library without a restaurant-id header.
router.post(
  "/upload",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  mediaController.addMedia
);
router.put(
  "/:id",
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  mediaController.updateMedia
);
router.delete(
  "/:id",
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  mediaController.deleteMedia
);

export default router;
