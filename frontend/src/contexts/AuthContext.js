import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { initializeKeys, exportPublicKey, clearIdentityKeys } from '../utils/crypto';
import { connectSocket, disconnectSocket } from '../utils/socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [identityKeys, setIdentityKeys] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      try {
        const token = localStorage.getItem('sc_token');
        const savedUser = localStorage.getItem('sc_user');

        if (token && savedUser) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);

          // Load/generate crypto keys from IndexedDB
          const keys = await initializeKeys();
          setIdentityKeys(keys);

          // Connect socket
          connectSocket(token);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        logout();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const register = useCallback(async ({ username, email, password }) => {
    setError(null);
    try {
      // Generate identity keys before registering
      const keys = await initializeKeys();
      const publicKeyB64 = await exportPublicKey(keys.publicKey);

      const { data } = await api.post('/auth/register', {
        username,
        email,
        password,
        publicKey: publicKeyB64,
      });

      localStorage.setItem('sc_token', data.token);
      localStorage.setItem('sc_user', JSON.stringify(data.user));
      setUser(data.user);
      setIdentityKeys(keys);
      connectSocket(data.token);

      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed.';
      setError(msg);
      return { success: false, message: msg };
    }
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/login', { email, password });

      localStorage.setItem('sc_token', data.token);
      localStorage.setItem('sc_user', JSON.stringify(data.user));
      setUser(data.user);

      const keys = await initializeKeys();
      setIdentityKeys(keys);

      // Update public key on server if changed
      const publicKeyB64 = await exportPublicKey(keys.publicKey);
      if (publicKeyB64 !== data.user.publicKey) {
        await api.put('/auth/keys', { publicKey: publicKeyB64 }).catch(() => {});
      }

      connectSocket(data.token);
      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed.';
      setError(msg);
      return { success: false, message: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_user');
    await clearIdentityKeys();
    setUser(null);
    setIdentityKeys(null);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, identityKeys, loading, error, register, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
