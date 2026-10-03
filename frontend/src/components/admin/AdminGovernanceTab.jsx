import React, { useState, useEffect } from 'react';
import {
  Key, Shield, Sparkles, Clock, AlertTriangle, Radio,
  Eye, EyeOff, CheckCircle2, Lock, Save
} from 'lucide-react';

export default function AdminGovernanceTab({
  config,
  token,
  onConfigUpdated,
  onPasswordChanged
}) {
  // Master Password Form State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Secret Chat Phrase State
  const [secretPhrase, setSecretPhrase] = useState(config?.secret_passphrase || 'Admin is here');
  const [phraseStatus, setPhraseStatus] = useState('');

  // Groq Governance State
  const [groqEnabled, setGroqEnabled] = useState(config?.groq_enabled ?? true);
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqStatus, setGroqStatus] = useState('');

  // Maintenance Mode State
  const [maintenanceMode, setMaintenanceMode] = useState(Boolean(config?.maintenance_mode));
  const [maintenanceMsg, setMaintenanceMsg] = useState(config?.maintenance_message || '');
  const [maintStatus, setMaintStatus] = useState('');

  // Temporary Public Lockout State
  const [lockoutMinutes, setLockoutMinutes] = useState(15);
  const [lockoutReason, setLockoutReason] = useState('Public sessions temporarily suspended for scheduled updates.');
  const [lockoutStatus, setLockoutStatus] = useState('');

  // Broadcast Banner State
  const [broadcastEnabled, setBroadcastEnabled] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastTheme, setBroadcastTheme] = useState('info');
  const [broadcastStatus, setBroadcastStatus] = useState('');

  // Load existing broadcast state from server on mount
  useEffect(() => {
    fetch('/api/broadcast')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setBroadcastEnabled(Boolean(data.enabled));
          setBroadcastMsg(data.message || '');
          setBroadcastTheme(data.theme || 'info');
        }
      })
      .catch(() => {});
  }, []);

  // 1. Handle Master Password Change
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!oldPassword) {
      setPwError('Please enter your current master password.');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }

    setPwSubmitting(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setPwError(data.detail || 'Password change failed.');
      } else {
        setPwSuccess('Master password successfully updated and re-encrypted!');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        if (data.new_token && onPasswordChanged) {
          onPasswordChanged(data.new_token);
        }
      }
    } catch (err) {
      setPwError('Network error while changing password.');
    } finally {
      setPwSubmitting(false);
    }
  };

  // 2. Handle Secret Chat Phrase Update
  const handleSaveSecretPhrase = async () => {
    if (!secretPhrase.trim()) return;
    setPhraseStatus('Saving phrase...');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ secret_passphrase: secretPhrase.trim() })
      });
      if (res.ok) {
        setPhraseStatus('Secret phrase saved!');
        if (onConfigUpdated) onConfigUpdated();
        setTimeout(() => setPhraseStatus(''), 2500);
      }
    } catch (e) {
      setPhraseStatus('Failed to update phrase.');
    }
  };

  // 3. Handle Groq LLM Configuration Update
  const handleSaveGroqConfig = async () => {
    setGroqStatus('Updating Groq...');
    try {
      const payload = { groq_enabled: groqEnabled };
      if (groqKeyInput.trim()) {
        payload.groq_api_key = groqKeyInput.trim();
      }
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setGroqStatus('Groq settings updated!');
        setGroqKeyInput('');
        if (onConfigUpdated) onConfigUpdated();
        setTimeout(() => setGroqStatus(''), 2500);
      }
    } catch (e) {
      setGroqStatus('Failed to update Groq.');
    }
  };

  // 4. Handle Maintenance Mode Update
  const handleSaveMaintenance = async () => {
    setMaintStatus('Saving maintenance...');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          maintenance_mode: maintenanceMode,
          maintenance_message: maintenanceMsg
        })
      });
      if (res.ok) {
        setMaintStatus('Maintenance settings updated!');
        if (onConfigUpdated) onConfigUpdated();
        setTimeout(() => setMaintStatus(''), 2500);
      }
    } catch (e) {
      setMaintStatus('Failed to update maintenance.');
    }
  };

  // 5. Handle Temporary Public Session Lockout
  const handleTriggerLockout = async () => {
    setLockoutStatus('Enforcing lockout...');
    try {
      const res = await fetch('/api/admin/public-lockout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          duration_minutes: parseInt(lockoutMinutes, 10),
          reason: lockoutReason
        })
      });
      if (res.ok) {
        setLockoutStatus('Public lockout active!');
        if (onConfigUpdated) onConfigUpdated();
        setTimeout(() => setLockoutStatus(''), 3000);
      }
    } catch (e) {
      setLockoutStatus('Failed to enforce lockout.');
    }
  };

  const handleLiftLockout = async () => {
    setLockoutStatus('Lifting blackout...');
    try {
      const res = await fetch('/api/admin/public-lockout/lift', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLockoutStatus('Public lockout lifted!');
        if (onConfigUpdated) onConfigUpdated();
        setTimeout(() => setLockoutStatus(''), 3000);
      }
    } catch (e) {
      setLockoutStatus('Failed to lift blackout.');
    }
  };

  // 6. Handle Public Broadcast Announcement
  const handleSaveBroadcast = async () => {
    setBroadcastStatus('Broadcasting...');
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          enabled: broadcastEnabled,
          message: broadcastMsg,
          theme: broadcastTheme
        })
      });
      if (res.ok) {
        setBroadcastStatus('Broadcast updated!');
        setTimeout(() => setBroadcastStatus(''), 2500);
      }
    } catch (e) {
      setBroadcastStatus('Failed to update broadcast.');
    }
  };

  const activeLockout = config?.public_lockout?.public_lockout;
  const lockoutRemaining = config?.public_lockout?.public_lockout_remaining_seconds || 0;
  const lockoutRemainingMins = Math.ceil(lockoutRemaining / 60);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
      {/* CARD 1: Master Password Reset / Security Vault */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#F1F5F9' }}>
          <Key size={18} color="#818CF8" /> Master Password & Security Vault
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.5' }}>
          Update the master administrative password with military-grade PBKDF2-HMAC-SHA256 (120,000 rounds).
        </p>

        {pwError && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#FCA5A5', fontSize: '12px', marginBottom: '12px' }}>
            {pwError}
          </div>
        )}
        {pwSuccess && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6EE7B7', fontSize: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} /> {pwSuccess}
          </div>
        )}

        <form onSubmit={handleChangePassword}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Current Password
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              New Password (minimum 8 characters)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
            />
          </div>

          <button
            type="submit"
            disabled={pwSubmitting}
            className="btn-primary"
            style={{ width: '100%', padding: '10px', fontSize: '13px', fontWeight: '600' }}
          >
            <Lock size={14} /> {pwSubmitting ? 'Re-encrypting Vault...' : 'Update Master Password'}
          </button>
        </form>
      </div>

      {/* CARD 2: Secret Chat Trigger Phrase */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#F1F5F9' }}>
          <Shield size={18} color="#38BDF8" /> Secret Chat Trigger Phrase
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.5' }}>
          Typing this secret passphrase in the public chat input unlocks the admin login modal without exposing any buttons to visitors.
        </p>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Current Trigger Phrase
          </label>
          <input
            type="text"
            value={secretPhrase}
            onChange={(e) => setSecretPhrase(e.target.value)}
            placeholder="e.g. Admin is here"
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#38BDF8', fontWeight: '600', fontSize: '13px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#34D399' }}>{phraseStatus}</span>
          <button onClick={handleSaveSecretPhrase} className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>
            <Save size={14} /> Save Phrase
          </button>
        </div>
      </div>

      {/* CARD 3: Groq Cloud LLM Configuration */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#F1F5F9' }}>
          <Sparkles size={18} color="#818CF8" /> Groq Cloud LLM Configuration
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.5' }}>
          Configure server-wide Groq activation and API key. When disabled, the engine falls back strictly to the offline PyTorch neural network.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff', display: 'block' }}>Groq LLM Engine</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {groqEnabled ? 'Active (Cloud Vocalizer & Speech)' : 'Disabled (Offline PyTorch Neural Net only)'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setGroqEnabled(!groqEnabled)}
            className="btn-ghost"
            style={{
              background: groqEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.15)',
              borderColor: groqEnabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.3)',
              color: groqEnabled ? '#34D399' : '#F87171',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '700'
            }}
          >
            {groqEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
              Server-Wide Groq API Key
            </label>
            <span style={{ fontSize: '11px', color: '#A5B4FC' }}>
              Status: {config?.groq_key_masked || 'Not configured'}
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type={showGroqKey ? 'text' : 'password'}
              value={groqKeyInput}
              onChange={(e) => setGroqKeyInput(e.target.value)}
              placeholder="Enter new key: gsk_..."
              style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            />
            <button
              type="button"
              onClick={() => setShowGroqKey(!showGroqKey)}
              style={{ position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {showGroqKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#34D399' }}>{groqStatus}</span>
          <button onClick={handleSaveGroqConfig} className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>
            <Save size={14} /> Update Groq
          </button>
        </div>
      </div>

      {/* CARD 4: System Maintenance Mode */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#F1F5F9' }}>
          <AlertTriangle size={18} color="#FBBF24" /> System Maintenance Mode
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.5' }}>
          Suspends inference requests for all public visitors. Authenticated administrators bypass maintenance automatically.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff', display: 'block' }}>Maintenance Shield</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {maintenanceMode ? 'ACTIVE - Public blocked with 503' : 'INACTIVE - Public access permitted'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMaintenanceMode(!maintenanceMode)}
            className="btn-ghost"
            style={{
              background: maintenanceMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
              borderColor: maintenanceMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.3)',
              color: maintenanceMode ? '#F87171' : '#34D399',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '700'
            }}
          >
            {maintenanceMode ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Custom Maintenance Notice
          </label>
          <textarea
            value={maintenanceMsg}
            onChange={(e) => setMaintenanceMsg(e.target.value)}
            rows={2}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#34D399' }}>{maintStatus}</span>
          <button onClick={handleSaveMaintenance} className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>
            <Save size={14} /> Update Maintenance
          </button>
        </div>
      </div>

      {/* CARD 5: Temporary Public Session Lockout */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#F1F5F9' }}>
          <Clock size={18} color="#F59E0B" /> Temporary Public Session Lockout
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.5' }}>
          Fully terminate and block public sessions for a custom duration with a live countdown clock. Admin bypasses lockout.
        </p>

        {activeLockout ? (
          <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#FDE68A', display: 'block', marginBottom: '4px' }}>
              Lockout Active: ~{lockoutRemainingMins} minutes remaining
            </span>
            <p style={{ fontSize: '12px', color: '#FCD34D', margin: '0 0 10px 0' }}>
              Public interactions are blocked with a live countdown screen.
            </p>
            <button
              onClick={handleLiftLockout}
              className="btn-ghost"
              style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#F87171', padding: '6px 14px', fontSize: '12px', fontWeight: '600' }}
            >
              Lift Suspension Early
            </button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Lockout Duration (Minutes)
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {[5, 15, 30, 60].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setLockoutMinutes(mins)}
                    className="btn-ghost"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: lockoutMinutes === mins ? 'rgba(245, 158, 11, 0.25)' : 'rgba(0,0,0,0.3)',
                      color: lockoutMinutes === mins ? '#FDE68A' : 'var(--text-muted)'
                    }}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                max="1440"
                value={lockoutMinutes}
                onChange={(e) => setLockoutMinutes(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Lockout Notice / Reason
              </label>
              <input
                type="text"
                value={lockoutReason}
                onChange={(e) => setLockoutReason(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: '#F59E0B' }}>{lockoutStatus}</span>
              <button
                onClick={handleTriggerLockout}
                className="btn-ghost"
                style={{ background: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#FDE68A', padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
              >
                Suspend Public Sessions
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CARD 6: Public Live Broadcast Announcement */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#F1F5F9' }}>
          <Radio size={18} color="#A78BFA" /> Public Broadcast Announcement
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.5' }}>
          Push an immediate live banner across all public visitors' screens in real-time.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontSize: '13px', color: '#fff' }}>Enable Public Banner</span>
          <button
            type="button"
            onClick={() => setBroadcastEnabled(!broadcastEnabled)}
            className="btn-ghost"
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              background: broadcastEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
              color: broadcastEnabled ? '#34D399' : 'var(--text-muted)'
            }}
          >
            {broadcastEnabled ? 'ENABLED' : 'OFF'}
          </button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Banner Theme & Urgency
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'info', label: 'Info', color: '#818CF8' },
              { id: 'warning', label: 'Warning', color: '#FBBF24' },
              { id: 'success', label: 'Success', color: '#34D399' },
              { id: 'alert', label: 'Critical', color: '#F87171' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBroadcastTheme(t.id)}
                className="btn-ghost"
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  background: broadcastTheme === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  borderColor: broadcastTheme === t.id ? t.color : 'transparent',
                  color: broadcastTheme === t.id ? t.color : 'var(--text-muted)'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Announcement Message
          </label>
          <input
            type="text"
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="e.g. VoxAI scheduled maintenance in 10 minutes!"
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#34D399' }}>{broadcastStatus}</span>
          <button onClick={handleSaveBroadcast} className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>
            <Radio size={14} /> Push Banner
          </button>
        </div>
      </div>
    </div>
  );
}
