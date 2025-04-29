const router = require("express").Router();
const { roleAuth } = require("../middleware/auth");
const {
addVariation,
getVariations,
updateVariation,
deleteVariation
} = require("../controllers/variationController");

router.post("/", roleAuth(["admin","manager"]), addVariation);
router.get("/", getVariations);
router.put("/:variationId", roleAuth(["admin","manager"]), updateVariation);
router.delete("/:variationId", roleAuth(["admin","manager"]), deleteVariation);

module.exports = router;
