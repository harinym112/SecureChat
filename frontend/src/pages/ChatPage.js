import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import './ChatPage.css';

const ChatPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="chat-page">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <ChatWindow sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
    </div>
  );
};

export default ChatPage;
