const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addProductToCategory,
  getProductsByCategory,
  deleteProduct,
  updateProduct,
  getAllProducts,
  getProductData,
} = require("../controllers/productController");

router.post(
  "/:categoryId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  addProductToCategory
);
router.get(
  "/:categoryId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getProductsByCategory
);
router.get(
  "/:productId/:variationId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getProductData
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getAllProducts
);
router.put(
  "/update/:productId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  updateProduct
);
router.delete(
  "/:productId",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  deleteProduct
);

module.exports = router;
