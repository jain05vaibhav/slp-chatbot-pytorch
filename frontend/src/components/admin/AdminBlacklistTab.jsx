import React, { useState } from 'react';
import { Ban, UserCheck, Plus, Copy, Check, ShieldAlert } from 'lucide-react';

export default function AdminBlacklistTab({
  bannedList,
  token,
  onRefresh
}) {
  const [manualTargetId, setManualTargetId] = useState('');
  const [manualFp, setManualFp] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [manualReason, setManualReason] = useState('Administrative policy violation');
  const [copiedKey, setCopiedKey] = useState(null);
  const [actionStatus, setActionStatus] = useState('');

  const handleManualBan = async (e) => {
    e.preventDefault();
    if (!manualTargetId.trim() && !manualFp.trim() && !manualIp.trim()) {
      alert('Please provide at least a Client ID, Hardware Fingerprint, or IP address.');
      return;
    }
    setActionStatus('Banning device...');
    try {
      const res = await fetch('/api/admin/ban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          client_id: manualTargetId.trim() || undefined,
          client_ip: manualIp.trim() || undefined,
          device_fingerprint: manualFp.trim() || undefined,
          reason: manualReason.trim()
        })
      });
      if (res.ok) {
        setManualTargetId('');
        setManualFp('');
        setManualIp('');
        setActionStatus('Device permanently blacklisted.');
        if (onRefresh) onRefresh();
        setTimeout(() => setActionStatus(''), 2500);
      }
    } catch (e) {
      setActionStatus('Failed to ban target.');
    }
  };

  const handleDirectUnban = async (identifier) => {
    if (!window.confirm(`Lift blacklist restriction on ${identifier}?`)) return;
    try {
      const res = await fetch('/api/admin/unban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ client_id: identifier })
      });
      if (res.ok) {
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error('Unban error:', e);
    }
  };

  const entries = Object.entries(bannedList || {});

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: '#F87171' }}>
            Permanent Hardware Blacklist & Ban Registry
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Multi-vector hardware device bans survive browser cache clears, private browsing, and dynamic IP hopping.
          </p>
        </div>
        <span style={{ fontSize: '12px', color: '#FDA4AF', fontWeight: '700', padding: '4px 12px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '999px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          {entries.length} Active Hardware Lockouts
        </span>
      </div>

      {/* Manual Hardware Ban Form */}
      <form onSubmit={handleManualBan} className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '14px', color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={15} color="#F87171" /> Manually Blacklist Target Identity
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>Client ID</label>
            <input
              type="text"
              placeholder="e.g. client_abc123"
              value={manualTargetId}
              onChange={(e) => setManualTargetId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>Hardware Fingerprint</label>
            <input
              type="text"
              placeholder="e.g. hwh_a8f9..."
              value={manualFp}
              onChange={(e) => setManualFp(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px', fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>IP Address</label>
            <input
              type="text"
              placeholder="e.g. 192.168.1.50"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>Violation Reason</label>
            <input
              type="text"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '12px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#F87171' }}>{actionStatus}</span>
          <button type="submit" className="btn-ghost" style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#FCA5A5', padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}>
            <Ban size={13} /> Enforce Blacklist
          </button>
        </div>
      </form>

      {/* Active Blacklist Entries */}
      <div className="glass-panel" style={{ padding: '16px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            No devices or visitors are currently blacklisted.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {entries.map(([key, entry]) => (
              <div
                key={key}
                style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '800', fontSize: '14px', color: '#FCA5A5' }}>
                      {entry.client_id || key}
                    </span>
                    {entry.auto_propagated_count > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#FCD34D', background: 'rgba(252, 211, 77, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                        Cross-Infected {entry.auto_propagated_count}x
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '6px' }}>
                    Reason: <span style={{ color: '#FDA4AF' }}>{entry.reason || 'Administrative restriction'}</span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--text-dim)' }}>
                    {entry.device_fingerprint && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>FP:</span>
                        <span style={{ fontFamily: 'monospace', color: '#A5B4FC' }}>
                          {entry.device_fingerprint}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(entry.device_fingerprint);
                            setCopiedKey(entry.device_fingerprint);
                            setTimeout(() => setCopiedKey(null), 2000);
                          }}
                          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0 }}
                          title="Copy fingerprint"
                        >
                          {copiedKey === entry.device_fingerprint ? <Check size={11} color="#34D399" /> : <Copy size={11} />}
                        </button>
                      </div>
                    )}

                    {entry.client_ip && (
                      <div>
                        <span>IP:</span> <span style={{ fontFamily: 'monospace', color: '#E2E8F0' }}>{entry.client_ip}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleDirectUnban(entry.ban_id || entry.client_id || key)}
                  className="btn-ghost"
                  style={{ color: '#34D399', borderColor: 'rgba(52, 211, 153, 0.3)', fontSize: '12px', padding: '6px 14px' }}
                >
                  <UserCheck size={14} /> Lift Ban
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
