const router = require("express").Router();
const { roleAuth } = require("../middleware/auth");
const {
addExtra,
deleteExtra,
getExtraById,
getExtras,
updateExtra,
getDashboardExtras
} = require("../controllers/extraController");

router.post("/", roleAuth(["admin","manager"]), addExtra);
router.get("/", getExtras);
router.get("/all", roleAuth(["admin","manager"]), getDashboardExtras);
// router.get("/:extraId", getExtraById);
router.put("/update/:extraId", roleAuth(["admin","manager"]), updateExtra);
router.delete("/:extraId", roleAuth(["admin","manager"]), deleteExtra);


module.exports = router;
