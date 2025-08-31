const express = require('express');
const router = express.Router();
const { removeAllImageHashes } = require('../controllers/generateImageHashes.controller');

// POST or GET route to trigger hash generation
router.post('/remove-image-hashes', removeAllImageHashes);


module.exports = router;
