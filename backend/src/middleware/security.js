const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { success: false, message: 'Message rate limit exceeded.' },
});

// XSS sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    const sanitize = (obj) => {
      if (typeof obj === 'string') return xss(obj);
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          obj[key] = sanitize(obj[key]);
        }
      }
      return obj;
    };
    // Only sanitize non-encrypted fields (don't touch ciphertext/keys)
    const safeFields = ['username', 'email', 'status'];
    safeFields.forEach((field) => {
      if (req.body[field]) req.body[field] = xss(req.body[field]);
    });
  }
  next();
};

// Replay attack prevention - track seen message IDs (in production, use Redis)
const seenMessageIds = new Set();
const MESSAGE_ID_TTL = 5 * 60 * 1000; // 5 minutes

const replayProtection = (req, res, next) => {
  const { messageId, timestamp } = req.body;

  if (!messageId || !timestamp) return next();

  const msgTime = new Date(timestamp).getTime();
  const now = Date.now();

  // Reject messages older than 5 minutes
  if (now - msgTime > MESSAGE_ID_TTL) {
    return res.status(400).json({ success: false, message: 'Message timestamp expired. Replay attack detected.' });
  }

  // Reject future-dated messages (clock skew tolerance: 30 seconds)
  if (msgTime - now > 30000) {
    return res.status(400).json({ success: false, message: 'Message timestamp is in the future.' });
  }

  // Check for duplicate message IDs
  if (seenMessageIds.has(messageId)) {
    return res.status(400).json({ success: false, message: 'Duplicate message detected. Replay attack prevented.' });
  }

  seenMessageIds.add(messageId);
  // Auto-cleanup after TTL
  setTimeout(() => seenMessageIds.delete(messageId), MESSAGE_ID_TTL);

  next();
};

module.exports = { authLimiter, apiLimiter, messageLimiter, sanitizeInput, mongoSanitize, replayProtection };
