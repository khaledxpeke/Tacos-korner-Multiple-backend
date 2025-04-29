const router = require("express").Router();
const { roleAuth } = require("../middleware/auth");
const {
  addDesert,
  getAllDeserts,
  getDesertById,
  updateDesert,
  deleteDesert,
  getDashboardDeserts,
} = require("../controllers/desertController");

router.post("/", roleAuth(["admin","manager"]), addDesert);
router.get("/", getAllDeserts);
router.get("/all", roleAuth(["admin","manager"]), getDashboardDeserts);
// router.get("/:desertId", getDesertById);
router.put("/update/:desertId", roleAuth(["admin","manager"]), updateDesert);
router.delete("/:desertId", roleAuth(["admin","manager"]), deleteDesert);

module.exports = router;
