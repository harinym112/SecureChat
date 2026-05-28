# 🔐 SecureChat

> Signal-inspired real-time messaging app with end-to-end encryption, perfect forward secrecy, and protection against MITM, replay, and XSS attacks.

**Stack:** React.js · Node.js · Express · Socket.io · MongoDB · Web Crypto API · Docker

---

## Table of Contents

- [Features](#features)
- [Security Architecture](#security-architecture)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [How Encryption Works](#how-encryption-works)
- [Architecture Overview](#architecture-overview)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- 🔒 **End-to-end encrypted** messages — the server never sees plaintext
- ⚡ **Real-time** messaging via Socket.io
- 🔑 **Perfect forward secrecy** — fresh ephemeral ECDH key pair per message
- 🛡️ **MITM protection** via identity key pinning
- 🔄 **Replay attack prevention** — message counters + unique IDs + 5-min timestamp window
- 🧹 **XSS & NoSQL injection** protection
- 🚦 **Rate limiting** on auth, API, and message routes
- 🐳 **Docker Compose** one-command setup

---

## Security Architecture

| Feature | Implementation |
|---|---|
| **E2E Encryption** | AES-256-GCM with ECDH (P-256) key exchange |
| **Perfect Forward Secrecy** | Fresh ephemeral ECDH key pair per message |
| **Key Derivation** | HKDF-SHA256 combining ephemeral + identity shared secrets |
| **MITM Protection** | Identity key pinning; public keys stored server-side per user |
| **Replay Attack Prevention** | Message counter + unique message IDs + 5-min timestamp window |
| **XSS Protection** | CSP headers + server-side XSS sanitization middleware |
| **NoSQL Injection** | express-mongo-sanitize on all inputs |
| **Rate Limiting** | Auth (10/15min), API (200/15min), Messages (60/min) |
| **JWT Security** | Short-lived signed tokens, Authorization header only |
| **Payload Limits** | 50KB max request body |

---

## Screenshots

![SecureChat App Preview](docs/screenshot.png)

> Dark-themed UI with real-time conversation list, end-to-end encrypted chat window, login/register screens, and a responsive mobile layout.

---

## Quick Start

### Option 1: Docker (Recommended)

**Prerequisites:** [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/securechat.git
cd securechat

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — set JWT_SECRET to a random 32+ character string

# 3. Start all services (MongoDB + Backend + Frontend)
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000) 🚀

---

### Option 2: Manual Setup

**Prerequisites:** Node.js 18+, MongoDB running locally

**1. Backend**

```bash
cd backend
cp .env.example .env
# Edit .env — set JWT_SECRET to a random 32+ character string
npm install
npm run dev
```

Backend runs on [http://localhost:5000](http://localhost:5000)

**2. Frontend**

```bash
cd frontend
npm install
npm start
```

Frontend runs on [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
securechat/
├── backend/
│   ├── config/
│   │   └── db.js                   # MongoDB connection
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js   # Register, login, key management
│   │   │   ├── messageController.js# Send/fetch messages, key bundles
│   │   │   └── userController.js   # Search, profile
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT auth + Socket.io auth
│   │   │   └── security.js         # Rate limiting, XSS, replay protection
│   │   ├── models/
│   │   │   ├── User.js             # User + public key storage
│   │   │   ├── Message.js          # Encrypted message storage
│   │   │   └── Conversation.js     # Conversation + counters
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── messages.js
│   │   │   └── users.js
│   │   ├── utils/
│   │   │   └── socket.js           # Socket.io event handlers
│   │   └── server.js               # Express + Socket.io entry point
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.js          # Conversations list + user search
│   │   │   ├── ChatWindow.js       # Message view + input
│   │   │   └── ProtectedRoute.js
│   │   ├── contexts/
│   │   │   ├── AuthContext.js      # Auth state + key initialization
│   │   │   └── ChatContext.js      # Messages, sockets, encryption orchestration
│   │   ├── pages/
│   │   │   ├── AuthPage.js         # Login / Register
│   │   │   └── ChatPage.js
│   │   ├── utils/
│   │   │   ├── crypto.js           # Web Crypto API — ECDH, AES-GCM, HKDF
│   │   │   ├── api.js              # Axios instance with JWT interceptor
│   │   │   └── socket.js           # Socket.io singleton
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## API Endpoints

### Auth

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register + upload public key |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/keys` | Update encryption keys |

### Messages

| Method | Route | Description |
|---|---|---|
| GET | `/api/messages/conversations` | List all conversations |
| GET | `/api/messages/conversation/:id` | Get messages in conversation |
| POST | `/api/messages/send` | Send encrypted message |
| PUT | `/api/messages/read/:id` | Mark messages as read |
| GET | `/api/messages/keys/:userId` | Fetch key bundle for E2E setup |

### Users

| Method | Route | Description |
|---|---|---|
| GET | `/api/users/search?q=` | Search users |
| GET | `/api/users/:userId` | Get user profile |
| PUT | `/api/users/profile` | Update profile |

---

## How Encryption Works

1. **Key Generation** — On first login, the client generates an ECDH P-256 identity key pair using the Web Crypto API. Private keys never leave the browser — stored as non-extractable `CryptoKey` objects in IndexedDB.

2. **Key Registration** — The public key is uploaded to the server and associated with the user's account.

3. **Sending a Message:**
   - Generate a fresh **ephemeral ECDH key pair** (perfect forward secrecy)
   - ECDH-derive two shared secrets: `ephemeral × recipient` and `identity × recipient`
   - XOR-combine both secrets, then derive an **AES-256-GCM key via HKDF-SHA256**
   - Encrypt the message with a random 96-bit IV
   - Send: `ciphertext + IV + ephemeral public key`

4. **Receiving a Message:**
   - Derive the same shared secrets using the sender's ephemeral key + identity key
   - Reconstruct the AES key via HKDF
   - Decrypt with AES-256-GCM

5. **Replay Protection** — Every message has a unique ID, a counter per conversation, and a 5-minute timestamp window.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│  ┌─────────────┐    ┌──────────────┐   ┌────────────┐  │
│  │  React UI   │◄──►│ ChatContext  │◄──►│ crypto.js  │  │
│  └─────────────┘    └──────┬───────┘   │ Web Crypto │  │
│                            │           │ ECDH/AES   │  │
│                            │           └─────┬──────┘  │
│                            │                 │          │
│                       Socket.io         IndexedDB       │
│                       + REST API      (private keys)    │
└────────────────────────────┼────────────────────────────┘
                             │ (encrypted ciphertext only)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                     Node.js Backend                     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │  Express │  │Socket.io │  │ Security Middleware │    │
│  │  Routes  │  │ Handler  │  │ Helmet/Rate Limit   │    │
│  └────┬─────┘  └────┬─────┘  │ XSS/NoSQL Sanitize │    │
│       └─────────────┘        └────────────────────┘    │
│                    │                                    │
└────────────────────┼────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │   MongoDB   │
              │  (stores    │
              │  ciphertext │
              │   only)     │
              └─────────────┘
```

> The server **never sees plaintext**. All encryption/decryption happens in the browser using the Web Crypto API.

---

## Environment Variables

Copy `.env.example` to `.env` in the project root before running:

```env
PORT=5000
JWT_SECRET=replace_with_a_secure_random_string_of_at_least_32_characters
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
NODE_ENV=production
```

> ⚠️ **Never commit your `.env` file.** It is already listed in `.gitignore`.

To generate a strong `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.
