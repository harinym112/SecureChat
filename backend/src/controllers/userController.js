const User = require('../models/User');

// Search users
const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters.' });
    }

    const users = await User.find({
      $and: [
        { _id: { $ne: req.user._id } },
        {
          $or: [
            { username: { $regex: q.trim(), $options: 'i' } },
            { email: { $regex: q.trim(), $options: 'i' } },
          ],
        },
      ],
    })
      .select('username email avatar status lastSeen publicKey')
      .limit(20);

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Search failed.' });
  }
};

// Get user profile by ID
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('username email avatar status lastSeen publicKey signedPreKey');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get user.' });
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const { username, avatar, status } = req.body;
    const updateData = {};
    if (username) updateData.username = username;
    if (avatar) updateData.avatar = avatar;
    if (status && ['online', 'offline', 'away'].includes(status)) updateData.status = status;

    const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true, runValidators: true });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

module.exports = { searchUsers, getUserById, updateProfile };
