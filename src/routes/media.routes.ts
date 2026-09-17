import { Router } from "express";
import * as mediaController from "../controllers/media.controller";
import { roleAuth } from "../middleware/auth.middleware";
import { USER_ROLES } from "../enum/constants";

const router = Router();

// Reads stay open: uploaded images/videos are displayed unauthenticated in
// public-facing menus/carousels, so they can't require a session.
router.get("/", mediaController.listMedia);
router.get("/types", mediaController.listTargetTypes);
router.get("/:id", mediaController.getMediaById);

// Uploads authenticate by role so ADMIN can add a restaurant logo
// (or shared library image) before a restaurant-id exists. Managers
// still send restaurant-id from the dashboard when they have one.
router.post(
  "/upload",
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
