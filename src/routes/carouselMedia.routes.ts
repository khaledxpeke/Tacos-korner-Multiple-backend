import { Router } from "express";
import * as carouselController from "../controllers/carouselMedia.controller";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), carouselController.addMedia);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), carouselController.getAllMedia);
router.get("/stream", restaurantAuth(), carouselController.getCarouselStream);
router.get(
  "/test-carousel",
  (req, _res, next) => {
    req.restaurantId = "67fa851dd299c52f0945b028";
    next();
  },
  carouselController.getCarouselStream
);
router.put("/order", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), carouselController.updateOrder);
router.delete("/:id", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), carouselController.deleteMedia);

export default router;
