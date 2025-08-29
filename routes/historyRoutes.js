const router = require("express").Router();
const { roleAuth, restaurantAuth } = require("../middleware/auth");
const {
  addHistory,
  getHistory,
  getLast10Orders,
  getCommandNumber,
  addEmail,
  getLatestPrintJob,
  updateStatus,
  getStatistics,
  manualPrint,
  getFailedPrints,
  retryPrint,
  retryAllFailedPrints,
  getPrintStats,
} = require("../controllers/historyController");
const { USER_ROLES } = require("../enum/constants");

router.post(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  addHistory
);
router.post(
  "/email",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  addEmail
);
router.post(
  "/CommandNumber",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  getCommandNumber
);
router.put(
  "/:id",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  updateStatus
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  getHistory
);
router.get(
  "/stats",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  getStatistics
);
router.get(
  "/10",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getLast10Orders
);
router.get(
  "/print-job/latest",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getLatestPrintJob
);

// 🖨️ Print Management Routes
router.post(
  "/:id/print",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER]),
  manualPrint
);

router.get(
  "/print/failed",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getFailedPrints
);

router.post(
  "/print/:id/retry",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  retryPrint
);

router.post(
  "/print/retry-all",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  retryAllFailedPrints
);

router.get(
  "/print/stats",
  restaurantAuth(),
  roleAuth([USER_ROLES.ADMIN, USER_ROLES.MANAGER]),
  getPrintStats
);

module.exports = router;
