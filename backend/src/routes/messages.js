const express = require('express');
const router = express.Router();
const { sendMessage, getMessages, getConversations, markAsRead, getKeyBundle } = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const { messageLimiter, replayProtection } = require('../middleware/security');

router.get('/conversations', protect, getConversations);
router.get('/conversation/:conversationId', protect, getMessages);
router.post('/send', protect, messageLimiter, replayProtection, sendMessage);
router.put('/read/:conversationId', protect, markAsRead);
router.get('/keys/:userId', protect, getKeyBundle);
module.exports = router;
