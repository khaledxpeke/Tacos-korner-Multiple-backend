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

router.get("/", restaurantAuth(),roleAuth(["admin","manager"]),getAllCategories);
router.post("/", restaurantAuth(),roleAuth(["admin","manager"]), createCategory);
router.get("/all", restaurantAuth(),roleAuth(["admin","manager"]), getAllCategory);
// router.get("/:categoryId", getCategoryById);
router.put("/position", restaurantAuth(),roleAuth(["admin","manager"]), updateCategoryPositions);
router.put("/update/:categoryId", restaurantAuth(),roleAuth(["admin","manager"]), updateCategory);
router.put("/position/:categoryId", restaurantAuth(),roleAuth(["admin","manager"]), updatePositions);
router.delete("/:categoryId",restaurantAuth(), roleAuth(["admin","manager"]), deleteCategory);

module.exports = router;
