import { Router } from "express";
import { removeAllImageHashes } from "../controllers/generateImageHashes.controller";

const router = Router();

router.post("/remove-image-hashes", removeAllImageHashes);

export default router;
