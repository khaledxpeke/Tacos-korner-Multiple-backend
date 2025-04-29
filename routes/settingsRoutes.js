const router = require("express").Router();
const { roleAuth ,restaurantAuth} = require("../middleware/auth");
const {
  getAllCurrencies,
  getSettings,
  addSettings,
  updateDefaultCurrency,
  deleteCurrency,
  updateSettings,
} = require("../controllers/settingsController");

router.get("/currency", restaurantAuth(),roleAuth(["admin","manager"]), getAllCurrencies);
router.get("/", restaurantAuth(),roleAuth(["admin","manager"]),getSettings);
router.post("/", restaurantAuth(),roleAuth(["admin","manager"]), addSettings);
router.delete("/currency", restaurantAuth(),roleAuth(["admin","manager"]), deleteCurrency);
router.put("/currency", restaurantAuth(),roleAuth(["admin","manager"]), updateDefaultCurrency);
router.put("/", restaurantAuth(),roleAuth(["admin","manager"]), updateSettings);


module.exports = router;
