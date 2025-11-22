// routes/marketpay.js
const express = require('express');
const router = express.Router();
const marketpayController = require('../controllers/marketPay.controller');

// The Market Pay platform sends a POST request to this exact path for SSO authorization
router.post('/marketpay', marketpayController.handleSSOPermission);

module.exports = router;