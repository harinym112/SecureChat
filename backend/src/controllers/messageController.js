const { v4: uuidv4 } = require('uuid');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

// Generate deterministic conversation ID from two user IDs
const getConversationId = (userId1, userId2) => {
  return [userId1.toString(), userId2.toString()].sort().join('_');
};

// Send a message (persisted)
const sendMessage = async (req, res) => {
  try {
    const { recipientId, ciphertext, iv, ephemeralKey, messageId, timestamp, messageCounter } = req.body;
    const senderId = req.user._id;

    if (!recipientId || !ciphertext || !iv || !messageId) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ success: false, message: 'Recipient not found.' });
    }

    const conversationId = getConversationId(senderId, recipientId);

    // Check/create conversation
    let conversation = await Conversation.findOne({ conversationId });
    if (!conversation) {
      conversation = await Conversation.create({
        conversationId,
        participants: [senderId, recipientId],
        messageCounters: {},
      });
    }

    // Replay attack: verify counter is greater than last seen
    const lastCounter = conversation.messageCounters.get(senderId.toString()) || -1;
    if (messageCounter !== undefined && messageCounter <= lastCounter) {
      return res.status(400).json({ success: false, message: 'Message counter invalid. Possible replay attack.' });
    }

    // Save message
    const message = await Message.create({
      conversationId,
      sender: senderId,
      recipient: recipientId,
      ciphertext,
      iv,
      ephemeralKey: ephemeralKey || null,
      messageCounter: messageCounter || 0,
      messageId,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    // Update conversation
    conversation.messageCounters.set(senderId.toString(), messageCounter || 0);
    conversation.lastMessage = { ciphertext, timestamp: message.timestamp, sender: senderId };
    await conversation.save();

    res.status(201).json({ success: true, message: 'Message sent.', data: message });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Duplicate message ID.' });
    }
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
};

// Get messages for a conversation
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user._id;

    // Security: ensure user is participant
    const conversation = await Conversation.findOne({ conversationId });
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const messages = await Message.find({ conversationId, deleted: false })
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('sender', 'username avatar')
      .populate('recipient', 'username avatar');

    res.json({ success: true, data: messages.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
};

// Get user's conversations list
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({ participants: userId })
      .sort({ updatedAt: -1 })
      .populate('participants', 'username avatar status lastSeen publicKey');

    res.json({ success: true, data: conversations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
  }
};

// Mark messages as read
const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    await Message.updateMany({ conversationId, recipient: userId, read: false }, { $set: { read: true } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark as read.' });
  }
};

// Get a user's key bundle for initial key exchange
const getKeyBundle = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('username publicKey signedPreKey oneTimePreKeys');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Pop one OTP key (one-time use)
    let oneTimePreKey = null;
    if (user.oneTimePreKeys.length > 0) {
      oneTimePreKey = user.oneTimePreKeys[0];
      await User.findByIdAndUpdate(userId, { $pop: { oneTimePreKeys: -1 } });
    }

    res.json({
      success: true,
      keyBundle: {
        userId: user._id,
        username: user.username,
        identityKey: user.publicKey,
        signedPreKey: user.signedPreKey,
        oneTimePreKey,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch key bundle.' });
  }
};

module.exports = { sendMessage, getMessages, getConversations, markAsRead, getKeyBundle, getConversationId };
