const express = require('express');
const { getStatus } = require('../controllers/statusController');
const { handleWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.get('/status', getStatus);
router.post('/webhook', handleWebhook);

module.exports = router;
