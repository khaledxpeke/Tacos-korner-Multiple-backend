import { Router } from "express";
import multer from "multer";
import { restaurantAuth, roleAuth } from "../middleware/auth.middleware";
import {
  exportRestaurantData,
  importRestaurantData,
  downloadRestaurantExport,
} from "../controllers/databaseExporter.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();
const upload = multer({ dest: "tmp/uploads/" });

router.get("/export", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), exportRestaurantData);
router.get("/download", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), downloadRestaurantExport);
router.post(
  "/import",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  upload.single("file"),
  importRestaurantData
);

export default router;
