const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addDesert,
  getAllDeserts,
  getDesertById,
  updateDesert,
  deleteDesert,
  getDashboardDeserts,
} = require("../controllers/desertController");
const { USER_ROLES } = require("../enum/constants");

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addDesert);
router.get(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getAllDeserts
);
router.get(
  "/all",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getDashboardDeserts
);
// router.get("/:desertId", getDesertById);
router.put(
  "/update/:desertId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  updateDesert
);
router.delete(
  "/:desertId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  deleteDesert
);

module.exports = router;
