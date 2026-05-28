import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

const AuthPage = () => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const { login, register, error } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setLocalError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (mode === 'register' && form.password.length < 8) {
      return setLocalError('Password must be at least 8 characters.');
    }

    setLoading(true);
    const result = mode === 'login' ? await login(form) : await register(form);
    setLoading(false);

    if (result.success) navigate('/');
    else setLocalError(result.message);
  };

  const displayError = localError || error;

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-grid" />
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
      </div>

      <div className="auth-container fade-in">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="4" y="12" width="20" height="14" rx="3" fill="#00d4ff" fillOpacity="0.15" stroke="#00d4ff" strokeWidth="1.5" />
              <path d="M9 12V8a5 5 0 0 1 10 0v4" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="14" cy="18.5" r="2" fill="#00d4ff" />
              <line x1="14" y1="20.5" x2="14" y2="23" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="auth-logo-text">SecureChat</span>
          <span className="auth-logo-badge">E2E Encrypted</span>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setLocalError(''); }}>
            Sign In
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setLocalError(''); }}>
            Create Account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="auth-field">
              <label>Username</label>
              <input name="username" type="text" placeholder="your_username" value={form.username} onChange={handleChange} required autoComplete="username" />
            </div>
          )}
          <div className="auth-field">
            <label>Email</label>
            <input name="email" type="email" placeholder="you@example.com" value={form.email} onChange={handleChange} required autoComplete="email" />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input name="password" type="password" placeholder="••••••••" value={form.password} onChange={handleChange} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>

          {displayError && <div className="auth-error">{displayError}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <span className="auth-loading">
                <span className="spinner" />
                {mode === 'login' ? 'Signing in...' : 'Creating keys...'}
              </span>
            ) : mode === 'login' ? 'Sign In' : 'Create Account & Generate Keys'}
          </button>
        </form>

        <div className="auth-security-note">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L1 3v3c0 3.31 2.12 5.54 5 6 2.88-.46 5-2.69 5-6V3L6 1z" fill="#00d4ff" fillOpacity="0.6" />
          </svg>
          Keys generated locally · Zero-knowledge server · Perfect forward secrecy
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
