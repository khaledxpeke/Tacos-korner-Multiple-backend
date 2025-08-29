const router = require("express").Router();
const { roleAuth , restaurantAuth} = require("../middleware/auth");
const {
  createCategory,
  getAllCategories,
  getAllCategory,
  getCategoryById,
  updateCategory,
  updatePositions,
  updateCategoryPositions,
  deleteCategory,
} = require("../controllers/categoryController");
const { USER_ROLES } = require("../enum/constants");

router.get("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER,USER_ROLES.WAITER]),getAllCategories);
router.post("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), createCategory);
router.get("/all", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllCategory);
// router.get("/:categoryId", getCategoryById);
router.put("/position", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateCategoryPositions);
router.put("/update/:categoryId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateCategory);
router.put("/position/:categoryId", restaurantAuth(),roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updatePositions);
router.delete("/:categoryId",restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteCategory);

module.exports = router;
