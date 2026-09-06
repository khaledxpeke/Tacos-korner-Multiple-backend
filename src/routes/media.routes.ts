import { Router } from "express";
import * as mediaController from "../controllers/media.controller";

const router = Router();

router.get("/", mediaController.listMedia);
router.get("/types", mediaController.listTargetTypes);
router.post("/upload", mediaController.addMedia);
router.get("/:id", mediaController.getMediaById);
router.put("/:id", mediaController.updateMedia);
router.delete("/:id", mediaController.deleteMedia);

export default router;
