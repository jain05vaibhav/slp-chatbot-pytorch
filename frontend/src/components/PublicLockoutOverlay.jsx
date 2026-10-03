import React, { useState, useEffect } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';

export default function PublicLockoutOverlay({
  isLockout,
  remainingSeconds: initialRemaining,
  lockoutReason
}) {
  const [remaining, setRemaining] = useState(initialRemaining || 0);

  useEffect(() => {
    setRemaining(initialRemaining || 0);
  }, [initialRemaining]);

  useEffect(() => {
    if (!isLockout || remaining <= 0) return;
    const timer = setInterval(() => {
      setRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLockout, remaining]);

  if (!isLockout) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

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
      zIndex: 999985,
      padding: '24px',
      userSelect: 'none'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        textAlign: 'center',
        padding: '40px 32px',
        borderRadius: '24px',
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
      }}>
        <div style={{
          width: '90px',
          height: '90px',
          borderRadius: '28px',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.05) 100%)',
          border: '2px solid rgba(245, 158, 11, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto',
          boxShadow: '0 0 35px rgba(245, 158, 11, 0.2)'
        }}>
          <Clock size={40} color="#FBBF24" />
        </div>

        <h2 style={{
          fontSize: '26px',
          fontWeight: '800',
          color: '#F8FAFC',
          marginBottom: '8px'
        }}>
          Public Access Suspended
        </h2>

        {/* Live Countdown Display */}
        <div style={{
          margin: '18px 0',
          padding: '16px',
          borderRadius: '16px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          display: 'inline-block'
        }}>
          <span style={{ fontSize: '13px', color: '#FCD34D', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Resuming Service In
          </span>
          <span style={{
            fontSize: '36px',
            fontWeight: '800',
            fontFamily: 'var(--font-mono)',
            color: '#FDE68A',
            letterSpacing: '0.05em'
          }}>
            {timeFormatted}
          </span>
        </div>

        <p style={{
          fontSize: '14px',
          color: '#94A3B8',
          lineHeight: '1.6',
          marginBottom: '24px'
        }}>
          {lockoutReason || 'An administrative session blackout is currently in effect for all public interactions. Normal service will resume automatically once the countdown completes.'}
        </p>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          fontSize: '12px',
          color: '#FDE68A',
          fontWeight: '600'
        }}>
          <ShieldAlert size={14} />
          <span>Temporary Security Blackout Active</span>
        </div>
      </div>
    </div>
  );
}
