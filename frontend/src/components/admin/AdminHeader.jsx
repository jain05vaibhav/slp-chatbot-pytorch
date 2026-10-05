import React from 'react';
import { Activity, Settings, Users, Terminal, Ban, RefreshCw, LogOut, ShieldAlert, X } from 'lucide-react';

export default function AdminHeader({
  activeTab,
  setActiveTab,
  syncStatus,
  onForceS3Sync,
  onSafeLogout,
  onEmergencyLock,
  onClose
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px',
      borderBottom: '1px solid var(--border-glass)',
      background: 'rgba(10, 15, 29, 0.95)',
      flexWrap: 'wrap',
      gap: '12px'
    }}>
      {/* Brand & Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: '#10B981',
            boxShadow: '0 0 10px #10B981'
          }} />
          <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, letterSpacing: '0.03em' }}>
            VoxAI Security Vault & Command Deck
          </h2>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px' }}>
          <button
            onClick={() => setActiveTab('vitals')}
            className="btn-ghost"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              background: activeTab === 'vitals' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: activeTab === 'vitals' ? '#A5B4FC' : 'var(--text-muted)',
              borderColor: activeTab === 'vitals' ? 'rgba(99, 102, 241, 0.4)' : 'transparent'
            }}
          >
            <Activity size={14} /> Vitals
          </button>

          <button
            onClick={() => setActiveTab('governance')}
            className="btn-ghost"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              background: activeTab === 'governance' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: activeTab === 'governance' ? '#A5B4FC' : 'var(--text-muted)',
              borderColor: activeTab === 'governance' ? 'rgba(99, 102, 241, 0.4)' : 'transparent'
            }}
          >
            <Settings size={14} /> Governance & Security
          </button>

          <button
            onClick={() => setActiveTab('conversations')}
            className="btn-ghost"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              background: activeTab === 'conversations' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: activeTab === 'conversations' ? '#A5B4FC' : 'var(--text-muted)',
              borderColor: activeTab === 'conversations' ? 'rgba(99, 102, 241, 0.4)' : 'transparent'
            }}
          >
            <Users size={14} /> Conversations
          </button>

          <button
            onClick={() => setActiveTab('playground')}
            className="btn-ghost"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              background: activeTab === 'playground' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: activeTab === 'playground' ? '#A5B4FC' : 'var(--text-muted)',
              borderColor: activeTab === 'playground' ? 'rgba(99, 102, 241, 0.4)' : 'transparent'
            }}
          >
            <Terminal size={14} /> Model Playground
          </button>

          <button
            onClick={() => setActiveTab('blacklist')}
            className="btn-ghost"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              background: activeTab === 'blacklist' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              color: activeTab === 'blacklist' ? '#F87171' : 'var(--text-muted)',
              borderColor: activeTab === 'blacklist' ? 'rgba(239, 68, 68, 0.4)' : 'transparent'
            }}
          >
            <Ban size={14} /> Device Blacklist
          </button>

          <button
            onClick={() => setActiveTab('moderation')}
            className="btn-ghost"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              background: activeTab === 'moderation' ? 'rgba(244, 63, 94, 0.2)' : 'transparent',
              color: activeTab === 'moderation' ? '#FDA4AF' : 'var(--text-muted)',
              borderColor: activeTab === 'moderation' ? 'rgba(244, 63, 94, 0.4)' : 'transparent'
            }}
          >
            <ShieldAlert size={14} /> AI Moderation & Filter
          </button>
        </div>
      </div>

      {/* Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Force S3 Sync Button */}
        <button
          onClick={onForceS3Sync}
          className="btn-ghost"
          style={{ fontSize: '12px', padding: '6px 12px' }}
          title="Force state sync to AWS S3 Cloud Bucket"
        >
          <RefreshCw size={13} className={syncStatus.includes('Syncing') ? 'animate-spin' : ''} />
          <span>{syncStatus || 'Sync Cloud'}</span>
        </button>

        {/* Safe Logout Button */}
        <button
          onClick={onSafeLogout}
          className="btn-ghost"
          style={{
            fontSize: '12px',
            padding: '6px 12px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'rgba(16, 185, 129, 0.3)',
            color: '#34D399'
          }}
          title="Safely log out of master admin and return to chat interface"
        >
          <LogOut size={13} />
          <span>Safe Logout</span>
        </button>

        {/* Emergency Lock Button */}
        <button
          onClick={onEmergencyLock}
          className="btn-ghost"
          style={{
            fontSize: '12px',
            padding: '6px 12px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            color: '#F87171'
          }}
          title="Emergency Protocol: Invalidate all active admin tokens immediately"
        >
          <ShieldAlert size={13} />
          <span>Emergency Lock</span>
        </button>

        {/* Close Deck Button */}
        <button
          onClick={onClose}
          className="btn-ghost"
          style={{ padding: '6px 10px' }}
          title="Close Admin Deck"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
