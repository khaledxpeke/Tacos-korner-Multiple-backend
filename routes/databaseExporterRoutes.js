const router = require("express").Router();
const { restaurantAuth, roleAuth } = require("../middleware/auth");
const {
  exportRestaurantData,
  importRestaurantData,
  downloadRestaurantExport,
} = require("../controllers/databaseExporter.controller");
const multer = require("multer");
const { USER_ROLES } = require("../enum/constants");
const upload = multer({ dest: "tmp/uploads/" });

router.get("/export", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), exportRestaurantData);
router.get("/download", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), downloadRestaurantExport);
router.post("/import", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), upload.single("file"), importRestaurantData);

module.exports = router;
