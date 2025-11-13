const express = require("express");
const router = express.Router();
const allergyController = require("../controllers/allergy.controller");
const { roleAuth } = require("../middleware/auth");
const { USER_ROLES } = require("../enum/constants");


router.post("/", roleAuth([USER_ROLES.ADMIN]), allergyController.createAllergy);
router.get(
  "/",
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  allergyController.getAllergies
);
router.put(
  "/:allergyId",
  roleAuth([USER_ROLES.ADMIN]),
  allergyController.updateAllergy
);
router.delete(
  "/:allergyId",
  roleAuth([USER_ROLES.ADMIN]),
  allergyController.deleteAllergy
);

module.exports = router;
