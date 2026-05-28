const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { getConversationId } = require('../controllers/messageController');

// Track online users: userId -> socketId
const onlineUsers = new Map();

const setupSocket = (io) => {
  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`🔌 User connected: ${user.username} (${socket.id})`);

    // Register user as online
    onlineUsers.set(user._id.toString(), socket.id);
    await User.findByIdAndUpdate(user._id, { status: 'online', socketId: socket.id, lastSeen: new Date() });

    // Broadcast online status to all clients
    io.emit('user:status', { userId: user._id, status: 'online', lastSeen: new Date() });

    // ───────────────────────────────────────────────
    // JOIN personal room
    // ───────────────────────────────────────────────
    socket.join(user._id.toString());

    // ───────────────────────────────────────────────
    // SEND MESSAGE (real-time delivery)
    // ───────────────────────────────────────────────
    socket.on('message:send', async (data, callback) => {
      try {
        const { recipientId, ciphertext, iv, ephemeralKey, messageId, timestamp, messageCounter } = data;

        if (!recipientId || !ciphertext || !iv || !messageId) {
          return callback?.({ success: false, error: 'Missing required fields.' });
        }

        const conversationId = getConversationId(user._id, recipientId);

        // Replay protection
        const now = Date.now();
        const msgTime = new Date(timestamp || now).getTime();
        if (now - msgTime > 5 * 60 * 1000) {
          return callback?.({ success: false, error: 'Message timestamp expired.' });
        }

        // Save to DB
        let conversation = await Conversation.findOne({ conversationId });
        if (!conversation) {
          conversation = await Conversation.create({
            conversationId,
            participants: [user._id, recipientId],
            messageCounters: {},
          });
        }

        const message = await Message.create({
          conversationId,
          sender: user._id,
          recipient: recipientId,
          ciphertext,
          iv,
          ephemeralKey: ephemeralKey || null,
          messageCounter: messageCounter || 0,
          messageId,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
        });

        conversation.messageCounters.set(user._id.toString(), messageCounter || 0);
        conversation.lastMessage = { ciphertext, timestamp: message.timestamp, sender: user._id };
        await conversation.save();

        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username avatar')
          .populate('recipient', 'username avatar');

        // Deliver to recipient if online
        const recipientSocketId = onlineUsers.get(recipientId.toString());
        if (recipientSocketId) {
          io.to(recipientId.toString()).emit('message:receive', {
            ...populatedMessage.toObject(),
            delivered: true,
          });
          // Mark as delivered
          await Message.findByIdAndUpdate(message._id, { delivered: true });
        }

        // Confirm to sender
        callback?.({ success: true, message: populatedMessage });

      } catch (error) {
        if (error.code === 11000) {
          return callback?.({ success: false, error: 'Duplicate message.' });
        }
        console.error('Socket message:send error:', error);
        callback?.({ success: false, error: 'Failed to send message.' });
      }
    });

    // ───────────────────────────────────────────────
    // TYPING INDICATORS
    // ───────────────────────────────────────────────
    socket.on('typing:start', ({ recipientId }) => {
      io.to(recipientId.toString()).emit('typing:start', { userId: user._id, username: user.username });
    });

    socket.on('typing:stop', ({ recipientId }) => {
      io.to(recipientId.toString()).emit('typing:stop', { userId: user._id });
    });

    // ───────────────────────────────────────────────
    // MESSAGE READ RECEIPTS
    // ───────────────────────────────────────────────
    socket.on('message:read', async ({ conversationId, senderId }) => {
      try {
        await Message.updateMany(
          { conversationId, recipient: user._id, read: false },
          { $set: { read: true } }
        );
        io.to(senderId.toString()).emit('message:read', { conversationId, readBy: user._id });
      } catch (err) {
        console.error('Read receipt error:', err);
      }
    });

    // ───────────────────────────────────────────────
    // KEY EXCHANGE SIGNALING
    // ───────────────────────────────────────────────
    socket.on('key:exchange', ({ recipientId, keyData }) => {
      io.to(recipientId.toString()).emit('key:exchange', {
        senderId: user._id,
        keyData,
      });
    });

    // ───────────────────────────────────────────────
    // DISCONNECT
    // ───────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${user.username}`);
      onlineUsers.delete(user._id.toString());
      await User.findByIdAndUpdate(user._id, { status: 'offline', socketId: null, lastSeen: new Date() });
      io.emit('user:status', { userId: user._id, status: 'offline', lastSeen: new Date() });
    });
  });
};

const getOnlineUsers = () => onlineUsers;

module.exports = { setupSocket, getOnlineUsers };
