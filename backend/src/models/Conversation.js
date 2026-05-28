const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastMessage: {
      ciphertext: String,
      timestamp: Date,
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    // Track message counters per participant for replay attack prevention
    messageCounters: {
      type: Map,
      of: Number,
      default: {},
    },
    // Used one-time prekeys to prevent reuse
    usedPreKeys: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
