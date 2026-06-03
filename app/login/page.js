'use strict';
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/styles/auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please check your credentials.');
      }

      // Successful login, redirect to base route which handles dashboard routing
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCreds = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>AasaMedChem</div>
          <p className={styles.subtitle}>Inventory & Order Management System</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Email Address</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., admin@aasamedchem.com"
              required
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className={styles.demoBox}>
          <div className={styles.demoTitle}>Developer Test Accounts</div>
          <div className={styles.demoCreds}>
            <p style={{ cursor: 'pointer', marginBottom: '8px' }} onClick={() => fillDemoCreds('admin@aasamedchem.com', 'adminpassword')}>
              🔑 <strong>Admin:</strong> <code>admin@aasamedchem.com</code> / <code>adminpassword</code>
            </p>
            <p style={{ cursor: 'pointer' }} onClick={() => fillDemoCreds('seller@aasamedchem.com', 'sellerpassword')}>
              🔑 <strong>Seller:</strong> <code>seller@aasamedchem.com</code> / <code>sellerpassword</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
