const express = require('express');
const router = express.Router();
const { getLargestMedia } = require('../controllers/mediaController');

router.get('/largest', getLargestMedia);

module.exports = router;