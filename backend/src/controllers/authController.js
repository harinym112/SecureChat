const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

// Register
const register = async (req, res) => {
  try {
    const { username, email, password, publicKey, signedPreKey, oneTimePreKeys } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Username, email, and password are required.' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ success: false, message: `${field} already in use.` });
    }

    const user = await User.create({
      username,
      email,
      password,
      publicKey: publicKey || null,
      signedPreKey: signedPreKey || null,
      oneTimePreKeys: oneTimePreKeys || [],
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        publicKey: user.publicKey,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        publicKey: user.publicKey,
        signedPreKey: user.signedPreKey,
        status: user.status,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Upload/update public keys (for key rotation)
const updateKeys = async (req, res) => {
  try {
    const { publicKey, signedPreKey, oneTimePreKeys } = req.body;

    const updateData = {};
    if (publicKey) updateData.publicKey = publicKey;
    if (signedPreKey) updateData.signedPreKey = signedPreKey;
    if (oneTimePreKeys && Array.isArray(oneTimePreKeys)) {
      updateData.$push = { oneTimePreKeys: { $each: oneTimePreKeys } };
    }

    await User.findByIdAndUpdate(req.user._id, updateData);

    res.json({ success: true, message: 'Keys updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update keys.' });
  }
};

module.exports = { register, login, getMe, updateKeys };
