const express = require("express");
const router = express.Router();
const carouselController = require("../controllers/carouselMediaController");
const { roleAuth } = require("../middleware/auth");

router.post("/", roleAuth(["admin","manager"]),carouselController.addMedia);
router.get("/", roleAuth(["admin","manager"]),carouselController.getAllMedia);
router.get("/stream", carouselController.getCarouselStream);
router.put("/order",roleAuth(["admin","manager"]), carouselController.updateOrder);
router.delete("/:id", roleAuth(["admin","manager"]),carouselController.deleteMedia);


module.exports = router;
