
const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/media.controller");

router.get("/", mediaController.listMedia);
router.post("/upload", mediaController.addMedia)
router.get("/:id", mediaController.getMediaById);
router.put("/:id", mediaController.updateMedia);


module.exports = router;
