import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import './ChatWindow.css';

const Avatar = ({ username, size = 32 }) => {
  const colors = ['#00d4ff', '#7c3aed', '#00e676', '#ff5252', '#ffab40'];
  const color = colors[username?.charCodeAt(0) % colors.length] || '#00d4ff';
  return (
    <div className="avatar" style={{ width: size, height: size, background: `${color}20`, border: `1px solid ${color}40`, color, fontSize: size * 0.38, borderRadius: 6 }}>
      {username?.[0]?.toUpperCase() || '?'}
    </div>
  );
};

const TypingIndicator = () => (
  <div className="typing-indicator">
    <span />
    <span />
    <span />
  </div>
);

const ChatWindow = ({ sidebarOpen, setSidebarOpen }) => {
  const { user, identityKeys } = useAuth();
  const { activeConversation, messages, typingUsers, onlineUsers, sendMessage, getKeyBundle, startTyping, stopTyping } = useChat();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [recipientKeyBundle, setRecipientKeyBundle] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const isTyping = useRef(false);

  const conv = activeConversation;
  const otherUser = conv?.otherUser;
  const convMessages = conv ? (messages[conv.conversationId] || []) : [];
  const isOtherTyping = otherUser && typingUsers[(otherUser._id || otherUser.id)];
  const isOtherOnline = otherUser && onlineUsers[(otherUser._id || otherUser.id)]?.status === 'online';

  // Load recipient keys when conversation changes
  useEffect(() => {
    if (otherUser) {
      const otherId = otherUser._id || otherUser.id;
      if (otherUser.publicKey) {
        setRecipientKeyBundle({ identityKey: otherUser.publicKey });
      } else {
        getKeyBundle(otherId).then(setRecipientKeyBundle).catch(() => {});
      }
    }
  }, [otherUser, getKeyBundle]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convMessages, isOtherTyping]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !conv || sending) return;
    if (!recipientKeyBundle?.identityKey) {
      return setError("Recipient's encryption key not found. Cannot send.");
    }

    stopTyping(otherUser._id || otherUser.id);
    isTyping.current = false;

    setInput('');
    setSending(true);
    setError('');

    try {
      await sendMessage(otherUser._id || otherUser.id, text, recipientKeyBundle.identityKey);
    } catch (err) {
      setError(err.message || 'Failed to send message.');
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, conv, sending, recipientKeyBundle, otherUser, sendMessage, stopTyping]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!conv || !otherUser) return;
    const recipientId = otherUser._id || otherUser.id;

    if (!isTyping.current) {
      isTyping.current = true;
      startTyping(recipientId);
    }
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      stopTyping(recipientId);
    }, 2000);
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Group messages by date
  const groupedMessages = convMessages.reduce((groups, msg) => {
    const date = formatDate(msg.timestamp || msg.createdAt);
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
    return groups;
  }, {});

  // Empty state
  if (!conv) {
    return (
      <div className="chat-window chat-empty">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="empty-state">
          <div className="empty-lock">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect x="8" y="22" width="32" height="22" rx="5" fill="rgba(0,212,255,0.1)" stroke="#00d4ff" strokeWidth="1.5" />
              <path d="M15 22V15a9 9 0 0 1 18 0v7" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="24" cy="32" r="3" fill="#00d4ff" />
              <line x1="24" y1="35" x2="24" y2="39" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h2>Your messages are encrypted</h2>
          <p>Select a conversation or search for a user to start a secure, end-to-end encrypted chat.</p>
          <div className="empty-features">
            <span>🔐 Perfect forward secrecy</span>
            <span>🛡️ MITM protection</span>
            <span>🔄 Replay attack prevention</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar username={otherUser?.username} size={36} />
          {isOtherOnline && <span className="status-dot-header online" />}
        </div>
        <div className="chat-header-info">
          <span className="chat-header-name">{otherUser?.username}</span>
          <span className="chat-header-status">
            {isOtherTyping ? 'typing...' : isOtherOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="chat-header-badge">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1L1 2.5v2.5C1 7.76 2.76 9.53 5 10c2.24-.47 4-2.24 4-5V2.5L5 1z" fill="#00d4ff" fillOpacity="0.7"/>
          </svg>
          E2E Encrypted
        </div>
      </div>

      {/* Messages */}
      <div className="messages-area">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date}>
            <div className="date-divider"><span>{date}</span></div>
            {msgs.map((msg, idx) => {
              const isOwn = (msg.sender?._id || msg.sender) === user?.id;
              const showAvatar = !isOwn && (idx === 0 || (msgs[idx - 1]?.sender?._id || msgs[idx - 1]?.sender) !== (msg.sender?._id || msg.sender));
              const displayText = msg._decrypted || (isOwn ? '[Sent — encrypted]' : '[Encrypted]');

              return (
                <div key={msg._id || msg.messageId} className={`message-wrapper ${isOwn ? 'own' : 'other'} fade-in`}>
                  {!isOwn && (
                    <div className="msg-avatar-slot">
                      {showAvatar && <Avatar username={otherUser?.username} size={28} />}
                    </div>
                  )}
                  <div className="message-bubble-wrap">
                    <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
                      <span className="message-text">{displayText}</span>
                      <div className="message-meta">
                        <span className="message-time">{formatTime(msg.timestamp || msg.createdAt)}</span>
                        {isOwn && (
                          <span className="message-status">
                            {msg.read ? '✓✓' : msg.delivered ? '✓✓' : '✓'}
                          </span>
                        )}
                        <span className="lock-icon" title="End-to-end encrypted">🔒</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {isOtherTyping && (
          <div className="message-wrapper other fade-in">
            <div className="msg-avatar-slot">
              <Avatar username={otherUser?.username} size={28} />
            </div>
            <div className="message-bubble other typing-bubble">
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && <div className="chat-error">{error} <button onClick={() => setError('')}>×</button></div>}

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            placeholder="Type a message... (End-to-end encrypted)"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={sending}
          />
          <button className="send-btn" onClick={handleSend} disabled={!input.trim() || sending}>
            {sending ? (
              <div className="send-spinner" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M15.5 9L2.5 2.5l2.5 6.5-2.5 6.5L15.5 9z" fill="currentColor"/>
              </svg>
            )}
          </button>
        </div>
        <div className="chat-input-hint">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1L1 2.5v2.5C1 7.76 2.76 9.53 5 10c2.24-.47 4-2.24 4-5V2.5L5 1z" fill="#00d4ff" fillOpacity="0.5"/>
          </svg>
          Messages are encrypted with AES-256-GCM · Press Enter to send
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
