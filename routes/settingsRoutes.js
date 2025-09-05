const router = require("express").Router();
const { roleAuth ,restaurantAuth} = require("../middleware/auth");
const {
  getAllCurrencies,
  getSettings,
  // getSettingsRT,
  addSettings,
  updateDefaultCurrency,
  deleteCurrency,
  updateSettings,
} = require("../controllers/settingsController");
const { USER_ROLES } = require("../enum/constants");

router.get("/currency", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), getAllCurrencies);
router.get("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]),getSettings);
// router.get("/rt", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER,USER_ROLES.WAITER]),getSettingsRT);
router.post("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), addSettings);
router.delete("/currency", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), deleteCurrency);
router.put("/currency", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), updateDefaultCurrency);
router.put("/", restaurantAuth(),roleAuth([USER_ROLES.ADMIN,USER_ROLES.MANAGER]), updateSettings);


module.exports = router;
