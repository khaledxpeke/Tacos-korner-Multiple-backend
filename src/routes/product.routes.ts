import { Router } from "express";
import { roleAuth, restaurantAuth } from "../middleware/auth.middleware";
import {
  addProductToCategory,
  getProductsByCategory,
  deleteProduct,
  updateProduct,
  getAllProducts,
  getProductData,
  setProductDiscount,
  removeProductDiscount,
  getSeuleProducts,
  migrateProductsCategory,
} from "../controllers/product.controller";
import { USER_ROLES } from "../enum/constants";

const router = Router();

router.post("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), addProductToCategory);
router.post(
  "/category/migrate",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  migrateProductsCategory
);
router.get("/seul", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getSeuleProducts);
router.get("/:categoryId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getProductsByCategory);
router.get(
  "/:productId/:variationId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getProductData
);
router.get("/", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), getAllProducts);
router.put("/update/:productId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), updateProduct);
router.delete("/:productId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), deleteProduct);
router.put("/discount/:productId", restaurantAuth(), roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]), setProductDiscount);
router.delete(
  "/discount/:productId",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  removeProductDiscount
);

export default router;
