const express = require('express');
const router = express.Router();
const printerController = require('../controllers/printerController');

// Endpoint for the printer to poll for jobs
router.get('/get-job', printerController.getPrintJob);

// (Optional) A route to manually add a test job for now
router.post('/add-test-job', printerController.addTestPrintJob);

module.exports = router;
