const router = require("express").Router();
const { roleAuth } = require("../middleware/auth");
const {
  addHistory,
  getHistory,
  getLast10Orders,
  getCommandNumber,
  addEmail,
  getLatestPrintJob,
  updateStatus,
  getStatistics,
} = require("../controllers/historyController");

router.post("/", addHistory);
router.post("/email", addEmail);
router.post("/CommandNumber", getCommandNumber);
router.put("/:id", roleAuth(["admin", "manager", "waiter"]), updateStatus);
router.get("/", roleAuth(["admin", "manager", "waiter"]), getHistory);
router.get("/stats", roleAuth(["admin", "manager", "waiter"]), getStatistics);
router.get("/10", roleAuth(["admin", "manager"]), getLast10Orders);
router.get("/print-job/latest", roleAuth(["admin", "manager"]), getLatestPrintJob);

module.exports = router;
