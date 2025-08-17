const router = require("express").Router();
const { restaurantAuth, roleAuth } = require("../middleware/auth");
const {
exportRestaurantData,
importRestaurantData
} = require("../controllers/databaseExporter.controller");
const multer = require("multer");
const upload = multer({ dest: "tmp/uploads/" });

router.get("/export", restaurantAuth(), roleAuth(["admin", "manager"]), exportRestaurantData);
router.post("/import", restaurantAuth(), roleAuth(["admin", "manager"]),upload.single("file"), importRestaurantData);


module.exports = router;
