import React from 'react';
import { Bot, Volume2, VolumeX, ShieldCheck } from 'lucide-react';

export default function Header({
  isOnline,
  isTtsEnabled,
  setIsTtsEnabled,
  onOpenAdmin,
  isAdminActive
}) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 28px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(7, 9, 14, 0.75)',
      backdropFilter: 'blur(20px)',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      {/* Brand Logo & Telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'var(--gradient-brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-glow)'
        }}>
          <Bot size={24} color="#FFFFFF" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{
              fontSize: '20px',
              fontWeight: '800',
              background: 'var(--gradient-brand)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0
            }}>
              VoxAI
            </h1>
            <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
              <span className={`pulse-indicator ${isOnline ? '' : 'offline'}`} />
              {isOnline ? 'Active' : 'Offline'}
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
            PyTorch DNN Intent Neural Net • Voice Assistant
          </p>
        </div>
      </div>

      {/* Audio & Authenticated Admin Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Speech TTS Toggle */}
        <button
          onClick={() => setIsTtsEnabled(!isTtsEnabled)}
          className="btn-ghost"
          title={isTtsEnabled ? 'Text-to-speech audio vocalizer enabled' : 'Vocalizer muted'}
          style={{ color: isTtsEnabled ? '#34D399' : 'var(--text-dim)' }}
        >
          {isTtsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Authenticated Admin Deck Button (Only rendered when admin is logged in) */}
        {isAdminActive && (
          <button
            onClick={onOpenAdmin}
            className="btn-ghost"
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              borderColor: 'rgba(16, 185, 129, 0.35)',
              color: '#34D399'
            }}
            title="Open Admin Command Deck"
          >
            <ShieldCheck size={16} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>
              Admin Deck
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
