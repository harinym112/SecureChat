require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');

const connectDB = require('../config/db');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const { socketAuth } = require('./middleware/auth');
const { apiLimiter, authLimiter, sanitizeInput, mongoSanitize } = require('./middleware/security');
const { setupSocket } = require('./utils/socket');

const app = express();
const server = http.createServer(app);

// ─── Socket.io Setup ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Socket auth middleware
io.use(socketAuth);
setupSocket(io);

// ─── Express Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", process.env.CLIENT_URL || 'http://localhost:3000'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50kb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(sanitizeInput);   // XSS protection
app.use('/api', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 SecureChat server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
});

module.exports = { app, server, io };
