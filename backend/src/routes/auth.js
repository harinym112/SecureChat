const express = require('express');
const router = express.Router();
const { register, login, getMe, updateKeys } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', protect, getMe);
router.put('/keys', protect, updateKeys);

module.exports = router;
