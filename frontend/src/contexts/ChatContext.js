import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import api from '../utils/api';
import { getSocket } from '../utils/socket';
import { encryptMessage, decryptMessage, generateMessageId } from '../utils/crypto';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const { user, identityKeys } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState({}); // conversationId -> [messages]
  const [typingUsers, setTypingUsers] = useState({}); // userId -> bool
  const [onlineUsers, setOnlineUsers] = useState({});
  const [messageCounters, setMessageCounters] = useState({});
  const messageCounterRef = useRef({});

  // Load conversations on mount
  useEffect(() => {
    if (user) fetchConversations();
  }, [user]);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return;

    // Incoming message
    socket.on('message:receive', async (msg) => {
      try {
        if (identityKeys && msg.ephemeralKey && msg.sender?.publicKey) {
          const plaintext = await decryptMessage(
            msg.ciphertext,
            msg.iv,
            msg.ephemeralKey,
            msg.sender.publicKey,
            identityKeys
          );
          msg._decrypted = plaintext;
        }
        addMessageToState(msg);
        updateConversationLastMessage(msg);
      } catch (err) {
        console.error('Failed to decrypt incoming message:', err);
        msg._decrypted = '[Decryption failed]';
        addMessageToState(msg);
      }
    });

    socket.on('typing:start', ({ userId }) => {
      setTypingUsers((prev) => ({ ...prev, [userId]: true }));
    });

    socket.on('typing:stop', ({ userId }) => {
      setTypingUsers((prev) => ({ ...prev, [userId]: false }));
    });

    socket.on('user:status', ({ userId, status, lastSeen }) => {
      setOnlineUsers((prev) => ({ ...prev, [userId]: { status, lastSeen } }));
    });

    socket.on('message:read', ({ conversationId }) => {
      setMessages((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] || []).map((m) => ({ ...m, read: true })),
      }));
    });

    return () => {
      socket.off('message:receive');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('user:status');
      socket.off('message:read');
    };
  }, [user, identityKeys]);

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/messages/conversations');
      setConversations(data.data || []);
    } catch (err) {
      console.error('fetchConversations error:', err);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId) => {
    try {
      const { data } = await api.get(`/messages/conversation/${conversationId}`);
      const msgs = data.data || [];

      // Decrypt all messages
      const decrypted = await Promise.all(
        msgs.map(async (msg) => {
          try {
            if (identityKeys && msg.ephemeralKey) {
              const senderPubKey = msg.sender?._id === user?.id ? null : msg.sender?.publicKey;
              if (senderPubKey) {
                msg._decrypted = await decryptMessage(
                  msg.ciphertext, msg.iv, msg.ephemeralKey, senderPubKey, identityKeys
                );
              } else if (msg.sender?._id === user?.id) {
                msg._decrypted = '[Sent message — decrypt on recipient side]';
              }
            }
          } catch {
            msg._decrypted = '[Decryption failed]';
          }
          return msg;
        })
      );

      setMessages((prev) => ({ ...prev, [conversationId]: decrypted }));

      // Mark as read
      const socket = getSocket();
      if (socket) {
        const otherUser = msgs[0]?.sender?._id !== user?.id ? msgs[0]?.sender?._id : msgs[0]?.recipient?._id;
        if (otherUser) {
          socket.emit('message:read', { conversationId, senderId: otherUser });
        }
      }
      await api.put(`/messages/read/${conversationId}`).catch(() => {});
    } catch (err) {
      console.error('fetchMessages error:', err);
    }
  }, [identityKeys, user]);

  const sendMessage = useCallback(async (recipientId, plaintext, recipientPublicKey) => {
    if (!identityKeys || !recipientPublicKey) {
      throw new Error('Encryption keys not available');
    }

    // Encrypt
    const { ciphertext, iv, ephemeralPublicKey } = await encryptMessage(
      plaintext, recipientPublicKey, identityKeys
    );

    const messageId = generateMessageId();
    const conversationId = [user.id, recipientId].sort().join('_');
    const counter = (messageCounterRef.current[conversationId] || 0) + 1;
    messageCounterRef.current[conversationId] = counter;

    const msgData = {
      recipientId,
      ciphertext,
      iv,
      ephemeralKey: ephemeralPublicKey,
      messageId,
      timestamp: new Date().toISOString(),
      messageCounter: counter,
    };

    // Send via socket for real-time, fallback to REST
    const socket = getSocket();
    if (socket?.connected) {
      return new Promise((resolve, reject) => {
        socket.emit('message:send', msgData, (response) => {
          if (response?.success) {
            const optimisticMsg = {
              ...response.message,
              _decrypted: plaintext,
              _optimistic: true,
            };
            addMessageToState(optimisticMsg);
            updateConversationLastMessage(optimisticMsg);
            resolve(response.message);
          } else {
            reject(new Error(response?.error || 'Send failed'));
          }
        });
      });
    } else {
      // REST fallback
      const { data } = await api.post('/messages/send', msgData);
      const optimisticMsg = { ...data.data, _decrypted: plaintext };
      addMessageToState(optimisticMsg);
      updateConversationLastMessage(optimisticMsg);
      return data.data;
    }
  }, [identityKeys, user]);

  const getKeyBundle = useCallback(async (userId) => {
    const { data } = await api.get(`/messages/keys/${userId}`);
    return data.keyBundle;
  }, []);

  const addMessageToState = (msg) => {
    setMessages((prev) => {
      const cid = msg.conversationId;
      const existing = prev[cid] || [];
      // Avoid duplicates
      if (existing.some((m) => m.messageId === msg.messageId || m._id === msg._id)) return prev;
      return { ...prev, [cid]: [...existing, msg] };
    });
  };

  const updateConversationLastMessage = (msg) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.conversationId === msg.conversationId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], lastMessage: { ...msg, timestamp: msg.timestamp || new Date() } };
      return updated;
    });
  };

  const startTyping = useCallback((recipientId) => {
    const socket = getSocket();
    socket?.emit('typing:start', { recipientId });
  }, []);

  const stopTyping = useCallback((recipientId) => {
    const socket = getSocket();
    socket?.emit('typing:stop', { recipientId });
  }, []);

  const startConversation = useCallback(async (targetUser) => {
    const conversationId = [user.id, targetUser._id || targetUser.id].sort().join('_');
    const existing = conversations.find((c) => c.conversationId === conversationId);

    if (!existing) {
      const newConv = {
        conversationId,
        participants: [user, targetUser],
        lastMessage: null,
        updatedAt: new Date().toISOString(),
      };
      setConversations((prev) => [newConv, ...prev]);
    }

    setActiveConversation({ conversationId, otherUser: targetUser });
    await fetchMessages(conversationId);
  }, [user, conversations, fetchMessages]);

  return (
    <ChatContext.Provider value={{
      conversations,
      activeConversation,
      setActiveConversation,
      messages,
      typingUsers,
      onlineUsers,
      sendMessage,
      fetchMessages,
      fetchConversations,
      getKeyBundle,
      startConversation,
      startTyping,
      stopTyping,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};
