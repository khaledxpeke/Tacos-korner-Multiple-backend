const router = require("express").Router();
const { roleAuth,restaurantAuth } = require("../middleware/auth");
const {
addExtra,
deleteExtra,
getExtraById,
getExtras,
updateExtra,
getDashboardExtras
} = require("../controllers/extraController");

router.post("/", restaurantAuth(),roleAuth(["admin","manager"]), addExtra);
router.get("/",restaurantAuth(),roleAuth(["admin","manager"]), getExtras);
router.get("/all",restaurantAuth(), roleAuth(["admin","manager"]), getDashboardExtras);
// router.get("/:extraId", getExtraById);
router.put("/update/:extraId", restaurantAuth(),roleAuth(["admin","manager"]), updateExtra);
router.delete("/:extraId", restaurantAuth(),roleAuth(["admin","manager"]), deleteExtra);


module.exports = router;
