import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, Plus, Trash2, RotateCcw, AlertTriangle,
  Search, ShieldCheck, UserX, CheckCircle, RefreshCw
} from 'lucide-react';

export default function AdminModerationTab({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newWordsInput, setNewWordsInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch moderation data
  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/moderation', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.warn('Failed to load moderation data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Toggle filter enabled
  const handleToggleEnabled = async () => {
    if (!data) return;
    const newEnabled = !data.enabled;
    try {
      const res = await fetch('/api/admin/moderation/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: newEnabled })
      });
      if (res.ok) {
        setData(prev => ({ ...prev, enabled: newEnabled }));
        setActionStatus(`Automated filter ${newEnabled ? 'Enabled' : 'Disabled'}`);
        setTimeout(() => setActionStatus(''), 2500);
      }
    } catch (e) {
      setActionStatus('Failed to update filter status.');
    }
  };

  // Add words
  const handleAddWords = async (e) => {
    e.preventDefault();
    if (!newWordsInput.trim()) return;

    const words = newWordsInput
      .split(',')
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0);

    if (words.length === 0) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/admin/moderation/words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ words })
      });
      if (res.ok) {
        setNewWordsInput('');
        setActionStatus(`Added ${words.length} prohibited term(s).`);
        fetchData();
        setTimeout(() => setActionStatus(''), 2500);
      }
    } catch (e) {
      setActionStatus('Failed to add words.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove word
  const handleRemoveWord = async (word) => {
    try {
      const res = await fetch(`/api/admin/moderation/words/${encodeURIComponent(word)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error('Failed to remove word:', e);
    }
  };

  // Reset words to defaults
  const handleResetDefaults = async () => {
    if (!window.confirm('Reset the prohibited word list to standard factory defaults?')) return;
    try {
      const res = await fetch('/api/admin/moderation/words/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setActionStatus('Reset to factory default curse words.');
        fetchData();
        setTimeout(() => setActionStatus(''), 2500);
      }
    } catch (e) {
      setActionStatus('Failed to reset defaults.');
    }
  };

  // Clear strikes
  const handleClearStrikes = async (identKey = null) => {
    const msg = identKey
      ? `Clear warning strike record for ${identKey}?`
      : 'Clear ALL active user strikes and warnings across the platform?';
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch('/api/admin/moderation/strikes/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ident_key: identKey })
      });
      if (res.ok) {
        setActionStatus(identKey ? 'User strike cleared.' : 'All strikes reset.');
        fetchData();
        setTimeout(() => setActionStatus(''), 2500);
      }
    } catch (e) {
      setActionStatus('Failed to clear strikes.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
        Loading Moderation Control Plane...
      </div>
    );
  }

  const prohibitedWords = data?.prohibited_words || [];
  const filteredWords = prohibitedWords.filter(w =>
    w.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );
  const incidents = data?.incidents || [];
  const strikes = data?.strikes || {};
  const activeStrikesList = Object.entries(strikes);

  return (
    <div>
      {/* 1. Header & Controls Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#F1F5F9' }}>
            <ShieldAlert size={22} color="#F43F5E" /> Automated AI & Profanity Shield
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Automatic Two-Strike Enforcement: 1st violation issues official warning, 2nd violation triggers instant permanent hardware ban.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {actionStatus && (
            <span style={{ fontSize: '12px', color: '#34D399', fontWeight: '600' }}>
              {actionStatus}
            </span>
          )}

          <button
            onClick={handleToggleEnabled}
            className="btn-ghost"
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              background: data?.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              borderColor: data?.enabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
              color: data?.enabled ? '#34D399' : '#F87171'
            }}
          >
            {data?.enabled ? 'SHIELD ACTIVE' : 'SHIELD DISABLED'}
          </button>
        </div>
      </div>

      {/* 2. Metrics Quick Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prohibited Terms</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#F43F5E', marginTop: '4px' }}>{prohibitedWords.length}</div>
        </div>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strike Policy</span>
          <div style={{ fontSize: '18px', fontWeight: '800', color: '#FBBF24', marginTop: '8px' }}>1 Warning → Permanent Ban</div>
        </div>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Warned Users</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#A78BFA', marginTop: '4px' }}>{activeStrikesList.length}</div>
        </div>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Interceptions</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#38BDF8', marginTop: '4px' }}>{data?.total_incidents || 0}</div>
        </div>
      </div>

      {/* 3. Word List & Add Section */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: '#F1F5F9' }}>
            Prohibited Words & Curse Filter ({filteredWords.length} terms)
          </h4>
          <button
            onClick={handleResetDefaults}
            className="btn-ghost"
            style={{ fontSize: '11px', padding: '4px 10px', color: 'var(--text-dim)' }}
          >
            <RotateCcw size={12} /> Reset to Defaults
          </button>
        </div>

        {/* Add Words Form */}
        <form onSubmit={handleAddWords} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Add new word(s) separated by commas (e.g. offensive_term, hate_phrase)..."
            value={newWordsInput}
            onChange={(e) => setNewWordsInput(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid var(--border-glass)',
              color: '#fff',
              fontSize: '13px'
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !newWordsInput.trim()}
            className="btn-primary"
            style={{ padding: '10px 18px', fontSize: '13px' }}
          >
            <Plus size={14} /> Add Words
          </button>
        </form>

        {/* Search Input */}
        <div style={{ marginBottom: '14px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder="Filter list of prohibited words..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '6px',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border-glass)',
              color: '#fff',
              fontSize: '12px'
            }}
          />
        </div>

        {/* Word Badges Cloud */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '6px' }}>
          {filteredWords.map((word) => (
            <span
              key={word}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#FDA4AF',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              {word}
              <button
                type="button"
                onClick={() => handleRemoveWord(word)}
                title={`Remove "${word}"`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FDA4AF',
                  cursor: 'pointer',
                  padding: '0 2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                ×
              </button>
            </span>
          ))}
          {filteredWords.length === 0 && (
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No words match your search.</span>
          )}
        </div>
      </div>

      {/* 4. Live Moderation Incident Log */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: '#F1F5F9' }}>
            Live Policy Enforcement Audit Log
          </h4>
          {activeStrikesList.length > 0 && (
            <button
              onClick={() => handleClearStrikes(null)}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '4px 10px', color: '#FBBF24' }}
            >
              <RotateCcw size={12} /> Clear All Active Strikes
            </button>
          )}
        </div>

        {incidents.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            No content policy violations or strikes recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
            {incidents.map((inc) => {
              const isBan = inc.action === 'ban';
              return (
                <div
                  key={inc.incident_id}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: isBan ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.08)',
                    border: `1px solid ${isBan ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: isBan ? '#EF4444' : '#F59E0B',
                          color: '#fff',
                          textTransform: 'uppercase'
                        }}
                      >
                        {isBan ? 'STRIKE 2: AUTOMATICALLY BANNED' : 'STRIKE 1: WARNING ISSUED'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                        {new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#E2E8F0', marginBottom: '4px' }}>
                      <strong>Detected: </strong>
                      <span style={{ color: '#F87171', fontWeight: '700' }}>
                        {(inc.detected_words || []).join(', ')}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      "{inc.query_snippet}"
                    </div>

                    <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      <span>IP: {inc.client_ip || '127.0.0.1'}</span>
                      {inc.device_fingerprint && (
                        <span>FP: {inc.device_fingerprint.substring(0, 16)}...</span>
                      )}
                    </div>
                  </div>

                  {!isBan && (
                    <button
                      onClick={() => handleClearStrikes(inc.ident_key)}
                      className="btn-ghost"
                      style={{ fontSize: '11px', padding: '4px 10px', color: '#34D399' }}
                    >
                      Forgive Strike
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
