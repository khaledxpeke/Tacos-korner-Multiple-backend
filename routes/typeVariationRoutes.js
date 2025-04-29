const router = require("express").Router();
const { roleAuth } = require("../middleware/auth");
const {
addTypeVariation,
getTypeVariations,
updateTypeVariation,
deleteTypeVariation
} = require("../controllers/typeVariationController");

router.post("/", roleAuth(["admin","manager"]), addTypeVariation);
router.get("/", getTypeVariations);
router.put("/:typeVariationId", roleAuth(["admin","manager"]), updateTypeVariation);
router.delete("/:typeVariationId", roleAuth(["admin","manager"]), deleteTypeVariation);

module.exports = router;
