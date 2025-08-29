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
const { USER_ROLES } = require("../enum/constants");

router.post("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addExtra);
router.get("/",restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getExtras);
router.get("/all",restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getDashboardExtras);
// router.get("/:extraId", getExtraById);
router.put("/update/:extraId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateExtra);
router.delete("/:extraId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteExtra);


module.exports = router;
