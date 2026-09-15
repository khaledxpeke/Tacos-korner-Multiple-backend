import { Router } from "express";
import { removeAllImageHashes } from "../controllers/generateImageHashes.controller";
import { roleAuth } from "../middleware/auth.middleware";
import { USER_ROLES } from "../enum/constants";

const router = Router();

// Bulk maintenance utility across every restaurant's data — admin-only.
router.post("/remove-image-hashes", roleAuth([USER_ROLES.ADMIN]), removeAllImageHashes);

export default router;
