const router = require("express").Router();
const { roleAuth,restaurantAuth } = require("../middleware/auth");
const { getStatusHistory } = require("../controllers/statusHistoryController");

router.get(
  "/:historyId",restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  getStatusHistory
);

module.exports = router;
