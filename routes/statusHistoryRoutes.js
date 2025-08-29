const router = require("express").Router();
const { roleAuth,restaurantAuth } = require("../middleware/auth");
const { getStatusHistory } = require("../controllers/statusHistoryController");
const { USER_ROLES } = require("../enum/constants");

router.get(
  "/:historyId",restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  getStatusHistory
);

module.exports = router;
