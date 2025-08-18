const express = require('express');
const router = express.Router();
const { generateAllImageHashes } = require('../controllers/generateImageHashes.controller');

// POST or GET route to trigger hash generation
router.post('/generate-image-hashes', generateAllImageHashes);
// Optionally, allow GET for testing
router.get('/generate-image-hashes', generateAllImageHashes);

module.exports = router;
