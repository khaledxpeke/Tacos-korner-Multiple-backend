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

router.post(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  addHistory
);
router.post(
  "/email",
  restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  addEmail
);
router.post(
  "/CommandNumber",
  restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  getCommandNumber
);
router.put(
  "/:id",
  restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  updateStatus
);
router.get(
  "/",
  restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  getHistory
);
router.get(
  "/stats",
  restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  getStatistics
);
router.get(
  "/10",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getLast10Orders
);
router.get(
  "/print-job/latest",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getLatestPrintJob
);

// 🖨️ Print Management Routes
router.post(
  "/:id/print",
  restaurantAuth(),
  roleAuth(["admin", "manager", "waiter"]),
  manualPrint
);

router.get(
  "/print/failed",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getFailedPrints
);

router.post(
  "/print/:id/retry",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  retryPrint
);

router.post(
  "/print/retry-all",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  retryAllFailedPrints
);

router.get(
  "/print/stats",
  restaurantAuth(),
  roleAuth(["admin", "manager"]),
  getPrintStats
);

module.exports = router;
