const express = require('express');
const router = express.Router();
const { searchUsers, getUserById, updateProfile } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.get('/search', protect, searchUsers);
router.get('/:userId', protect, getUserById);
router.put('/profile', protect, updateProfile);

module.exports = router;
