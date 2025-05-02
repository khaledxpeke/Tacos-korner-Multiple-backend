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

router.post("/", restaurantAuth(), roleAuth(["admin", "manager"]), addDesert);
router.get(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getAllDeserts
);
router.get(
  "/all",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getDashboardDeserts
);
// router.get("/:desertId", getDesertById);
router.put(
  "/update/:desertId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  updateDesert
);
router.delete(
  "/:desertId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  deleteDesert
);

module.exports = router;
