import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertTriangle, KeyRound, Cpu, WifiOff, Copy, Check } from 'lucide-react';

export default function BannedDeviceOverlay({
  isBanned,
  banReason,
  deviceFingerprint,
  clientIp,
  banDetails,
  onEmergencyUnbanSuccess
}) {
  const [showAdminUnlock, setShowAdminUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [copiedFp, setCopiedFp] = useState(false);

  if (!isBanned) return null;

  const handleCopyFp = () => {
    if (!deviceFingerprint) return;
    navigator.clipboard.writeText(deviceFingerprint);
    setCopiedFp(true);
    setTimeout(() => setCopiedFp(false), 2000);
  };

  const handleEmergencyUnlock = async (e) => {
    e.preventDefault();
    if (!unlockPassword.trim()) return;
    setUnlockLoading(true);
    setUnlockError('');

    try {
      const clientId = localStorage.getItem('voxai_client_id');
      const res = await fetch('/api/admin/unban-self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: unlockPassword.trim(),
          client_id: clientId,
          device_fingerprint: deviceFingerprint
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Authorization failed.');
      }

      if (data.token) {
        sessionStorage.setItem('voxai_admin_token', data.token);
      }

      if (onEmergencyUnbanSuccess) {
        onEmergencyUnbanSuccess();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setUnlockError(err.message || 'Authentication error.');
    } finally {
      setUnlockLoading(false);
    }
  };

  const reason = banReason || banDetails?.reason || 'Administrative policy violation and security enforcement.';
  const bannedAt = banDetails?.banned_at ? new Date(banDetails.banned_at).toLocaleString() : 'Permanent Active Record';
  const banId = banDetails?.ban_id || 'SEC-LOCK-' + (deviceFingerprint ? deviceFingerprint.substring(3, 11) : 'UNKNOWN');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 999999,
      background: 'radial-gradient(circle at center, #1E080D 0%, #090305 60%, #030102 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      overflowY: 'auto'
    }}>
      {/* Background Animated Cyber Lines */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(rgba(244, 63, 94, 0.12) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        pointerEvents: 'none',
        opacity: 0.8
      }} />

      <div style={{
        maxWidth: '680px',
        width: '100%',
        background: 'rgba(18, 5, 8, 0.94)',
        border: '2px solid #E11D48',
        borderRadius: '20px',
        padding: '36px 32px',
        boxShadow: '0 0 60px rgba(225, 29, 72, 0.35), inset 0 0 30px rgba(225, 29, 72, 0.15)',
        position: 'relative',
        zIndex: 1,
        backdropFilter: 'blur(20px)',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        {/* Pulsing Header Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(225, 29, 72, 0.2)',
            border: '2px solid #F43F5E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(244, 63, 94, 0.5)'
          }}>
            <ShieldAlert size={36} color="#F43F5E" />
          </div>
        </div>

        {/* Main Title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-block',
            fontSize: '11px',
            fontWeight: '800',
            letterSpacing: '2px',
            color: '#FDA4AF',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            padding: '4px 14px',
            borderRadius: '999px',
            marginBottom: '12px',
            textTransform: 'uppercase'
          }}>
            Critical Security Lockdown
          </div>

          <h1 style={{
            fontSize: '28px',
            fontWeight: '900',
            letterSpacing: '-0.5px',
            color: '#FFFFFF',
            margin: '0 0 8px 0',
            lineHeight: '1.2'
          }}>
            DEVICE PERMANENTLY BANNED
          </h1>

          <p style={{
            fontSize: '14px',
            color: '#FDA4AF',
            margin: 0,
            lineHeight: '1.5'
          }}>
            Access from this physical hardware device has been permanently terminated by the VoxAI system administrator.
          </p>
        </div>

        {/* Technical Ban Data Card */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(244, 63, 94, 0.25)',
          borderRadius: '12px',
          padding: '18px 20px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div>
            <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
              Enforcement Reason
            </span>
            <div style={{ fontSize: '14px', color: '#FEE2E2', fontWeight: '600', marginTop: '2px' }}>
              {reason}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
                Lockout Reference ID
              </span>
              <div style={{ fontSize: '13px', color: '#E2E8F0', fontFamily: 'monospace', fontWeight: '600', marginTop: '2px' }}>
                {banId}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
                Ban Timestamp
              </span>
              <div style={{ fontSize: '13px', color: '#E2E8F0', marginTop: '2px' }}>
                {bannedAt}
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
                Hardware Signature / Fingerprint
              </span>
              {deviceFingerprint && (
                <button
                  onClick={handleCopyFp}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedFp ? '#34D399' : '#FDA4AF',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {copiedFp ? <Check size={12} /> : <Copy size={12} />}
                  {copiedFp ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            <div style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#F43F5E',
              background: 'rgba(244, 63, 94, 0.1)',
              padding: '6px 10px',
              borderRadius: '6px',
              marginTop: '4px',
              wordBreak: 'break-all'
            }}>
              {deviceFingerprint || 'HARDWARE_SIGNATURE_CAPTURED'}
            </div>
          </div>

          {clientIp && (
            <div>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
                Network IP Reference
              </span>
              <div style={{ fontSize: '13px', color: '#CBD5E1', fontFamily: 'monospace', marginTop: '2px' }}>
                {clientIp}
              </div>
            </div>
          )}
        </div>

        {/* Unbypassability Warning */}
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          borderLeft: '4px solid #EF4444',
          padding: '12px 16px',
          borderRadius: '0 8px 8px 0',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FCA5A5', fontWeight: '700', fontSize: '13px', marginBottom: '4px' }}>
            <AlertTriangle size={16} />
            Hardware-Level Persistence Notice
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#FECDD3', lineHeight: '1.5' }}>
            This restriction is tied to your physical device hardware and GPU subsystem. Clearing browser cookies or cache, using Private / Incognito browsing, or changing IP addresses / VPNs will not bypass this ban.
          </p>
        </div>

        {/* Master Admin Unlock Portal */}
        <div style={{ textAlign: 'center', paddingTop: '10px' }}>
          {!showAdminUnlock ? (
            <button
              onClick={() => setShowAdminUnlock(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.35)',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.8)'}
              onMouseLeave={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.35)'}
            >
              <KeyRound size={13} />
              Owner Emergency Verification
            </button>
          ) : (
            <form onSubmit={handleEmergencyUnlock} style={{
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid var(--border-accent)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              textAlign: 'left'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#A5B4FC' }}>
                Master Administrator Override
              </div>
              <input
                type="password"
                placeholder="Enter master admin password to unban this device..."
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--border-glass)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />

              {unlockError && (
                <div style={{ fontSize: '12px', color: '#F43F5E', fontWeight: '600' }}>
                  {unlockError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowAdminUnlock(false)}
                  className="btn-ghost"
                  style={{ padding: '8px 14px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading || !unlockPassword}
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '12px' }}
                >
                  {unlockLoading ? 'Authenticating...' : 'Lift Ban & Authorize'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
