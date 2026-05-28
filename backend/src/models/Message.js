const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Encrypted ciphertext (base64)
    ciphertext: {
      type: String,
      required: true,
    },
    // IV for AES-GCM (base64)
    iv: {
      type: String,
      required: true,
    },
    // Ephemeral public key for this message's ratchet step (base64)
    ephemeralKey: {
      type: String,
      default: null,
    },
    // Message counter for replay attack prevention
    messageCounter: {
      type: Number,
      required: true,
      default: 0,
    },
    // Unique message ID for deduplication
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    // Timestamp signed by sender (for replay detection)
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for conversation queries
messageSchema.index({ conversationId: 1, timestamp: 1 });
messageSchema.index({ messageId: 1 }, { unique: true });

module.exports = mongoose.model('Message', messageSchema);
