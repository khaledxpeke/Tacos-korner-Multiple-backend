const router = require("express").Router();
const { roleAuth ,restaurantAuth} = require("../middleware/auth");
const {
  createType,
  getAllTypes,
  getTypeById,
  updateType,
  deleteType,
} = require("../controllers/typeController");
const { USER_ROLES } = require("../enum/constants");

router.post("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), createType);
router.get("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), getAllTypes);
router.get("/:typeId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), getTypeById);
router.put("/update/:typeId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), updateType);
router.delete("/:typeId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), deleteType);



module.exports = router;
