import React from 'react';
import { ShieldAlert, Lock } from 'lucide-react';

export default function MaintenanceOverlay({
  isMaintenance,
  customMessage
}) {
  if (!isMaintenance) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 7, 12, 0.95)',
      backdropFilter: 'blur(25px)',
      WebkitBackdropFilter: 'blur(25px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999990,
      padding: '24px',
      userSelect: 'none'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        textAlign: 'center',
        padding: '40px 32px',
        borderRadius: '24px',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
      }}>
        <div style={{
          width: '90px',
          height: '90px',
          borderRadius: '28px',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.05) 100%)',
          border: '2px solid rgba(239, 68, 68, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto',
          boxShadow: '0 0 35px rgba(239, 68, 68, 0.2)'
        }}>
          <Lock size={40} color="#F87171" />
        </div>

        <h2 style={{
          fontSize: '26px',
          fontWeight: '800',
          color: '#F8FAFC',
          marginBottom: '12px'
        }}>
          System Undergoing Maintenance
        </h2>

        <p style={{
          fontSize: '14px',
          color: '#94A3B8',
          lineHeight: '1.6',
          marginBottom: '28px'
        }}>
          {customMessage || 'VoxAI inference engines are currently suspended for scheduled maintenance and infrastructure updates. Normal access will resume shortly.'}
        </p>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.25)',
          fontSize: '12px',
          color: '#FDA4AF',
          fontWeight: '600'
        }}>
          <ShieldAlert size={14} />
          <span>Public Interactions Suspended</span>
        </div>
      </div>
    </div>
  );
}
