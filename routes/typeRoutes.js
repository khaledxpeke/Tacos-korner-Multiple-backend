const router = require("express").Router();
const { roleAuth ,restaurantAuth} = require("../middleware/auth");
const {
  createType,
  getAllTypes,
  getTypeById,
  updateType,
  deleteType,
} = require("../controllers/typeController");

router.post("/", restaurantAuth(),roleAuth(["admin","manager"]), createType);
router.get("/", restaurantAuth(),roleAuth(["admin","manager"]), getAllTypes);
router.get("/:typeId", restaurantAuth(),roleAuth(["admin","manager"]), getTypeById);
router.put("/update/:typeId", restaurantAuth(),roleAuth(["admin","manager"]), updateType);
router.delete("/:typeId", restaurantAuth(),roleAuth(["admin","manager"]), deleteType);



module.exports = router;
