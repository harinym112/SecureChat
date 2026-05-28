import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import api from '../utils/api';
import './Sidebar.css';

const Avatar = ({ username, size = 36 }) => {
  const colors = ['#00d4ff', '#7c3aed', '#00e676', '#ff5252', '#ffab40'];
  const color = colors[username?.charCodeAt(0) % colors.length] || '#00d4ff';
  return (
    <div className="avatar" style={{ width: size, height: size, background: `${color}20`, border: `1px solid ${color}40`, color }}>
      {username?.[0]?.toUpperCase() || '?'}
    </div>
  );
};

const Sidebar = ({ sidebarOpen }) => {
  const { user, logout } = useAuth();
  const { conversations, activeConversation, startConversation, onlineUsers } = useChat();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState('chats'); // 'chats' | 'search'

  // Live search
  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/users/search?q=${encodeURIComponent(search)}`);
        setSearchResults(data.data || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleSelectUser = async (targetUser) => {
    await startConversation(targetUser);
    setSearch('');
    setSearchResults([]);
    setView('chats');
  };

  const getOtherParticipant = (conv) => {
    return conv.participants?.find((p) => (p._id || p.id) !== user?.id);
  };

  const isOnline = (userId) => onlineUsers[userId]?.status === 'online';

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (!sidebarOpen) return null;

  return (
    <aside className="sidebar slide-in">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="7" width="14" height="10" rx="2.5" fill="#00d4ff" fillOpacity="0.15" stroke="#00d4ff" strokeWidth="1.2" />
            <path d="M5.5 7V5a3.5 3.5 0 0 1 7 0v2" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="9" cy="11.5" r="1.5" fill="#00d4ff" />
            <line x1="9" y1="13" x2="9" y2="15" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span>SecureChat</span>
        </div>
        <button className="icon-btn" onClick={logout} title="Sign out">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Current user */}
      <div className="sidebar-user">
        <div style={{ position: 'relative' }}>
          <Avatar username={user?.username} size={36} />
          <span className="status-dot online" />
        </div>
        <div className="sidebar-user-info">
          <span className="sidebar-username">{user?.username}</span>
          <span className="sidebar-usertag mono">E2E Encrypted</span>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="search-icon">
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3" />
          <line x1="9" y1="9" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setView(e.target.value ? 'search' : 'chats'); }}
        />
        {search && (
          <button className="search-clear" onClick={() => { setSearch(''); setView('chats'); }}>×</button>
        )}
      </div>

      {/* Content */}
      <div className="sidebar-content">
        {view === 'search' ? (
          <div>
            <div className="sidebar-section-label">Search Results</div>
            {searching && <div className="sidebar-empty">Searching...</div>}
            {!searching && search.length >= 2 && searchResults.length === 0 && (
              <div className="sidebar-empty">No users found</div>
            )}
            {searchResults.map((u) => (
              <button key={u._id} className="conv-item" onClick={() => handleSelectUser(u)}>
                <div style={{ position: 'relative' }}>
                  <Avatar username={u.username} />
                  {isOnline(u._id) && <span className="status-dot online" />}
                </div>
                <div className="conv-info">
                  <span className="conv-name">{u.username}</span>
                  <span className="conv-preview">{u.email}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="sidebar-section-label">Messages</div>
            {conversations.length === 0 && (
              <div className="sidebar-empty">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }}>
                  <path d="M4 8a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-4l-4 4-4-4H8a4 4 0 0 1-4-4V8z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
                Search for a user to start chatting
              </div>
            )}
            {conversations.map((conv) => {
              const other = getOtherParticipant(conv);
              if (!other) return null;
              const otherId = other._id || other.id;
              const isActive = activeConversation?.conversationId === conv.conversationId;
              return (
                <button
                  key={conv.conversationId}
                  className={`conv-item ${isActive ? 'active' : ''}`}
                  onClick={() => startConversation(other)}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar username={other.username} />
                    {isOnline(otherId) && <span className="status-dot online" />}
                  </div>
                  <div className="conv-info">
                    <div className="conv-row">
                      <span className="conv-name">{other.username}</span>
                      <span className="conv-time">{formatTime(conv.lastMessage?.timestamp || conv.updatedAt)}</span>
                    </div>
                    <span className="conv-preview">
                      {conv.lastMessage ? '🔒 Encrypted message' : 'No messages yet'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L1 3v3c0 3.31 2.12 5.54 5 6 2.88-.46 5-2.69 5-6V3L6 1z" fill="#00d4ff" fillOpacity="0.5" />
        </svg>
        <span>End-to-end encrypted · Signal protocol</span>
      </div>
    </aside>
  );
};

export default Sidebar;
