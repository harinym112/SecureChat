import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e14' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '2px solid #1e2c42', borderTopColor: '#00d4ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#4a5568' }}>Initializing secure session...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
