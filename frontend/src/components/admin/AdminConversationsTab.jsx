import React, { useState } from 'react';
import { Search, Download, Copy, Check, Send, Ban, UserCheck, MessageSquare } from 'lucide-react';

export default function AdminConversationsTab({
  users,
  selectedUser,
  onSelectUser,
  onToggleBan,
  onSendIntercom
}) {
  const [userSearch, setUserSearch] = useState('');
  const [intercomMsg, setIntercomMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  const filteredUsers = (users || []).filter(u => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      (u.client_id && u.client_id.toLowerCase().includes(q)) ||
      (u.display_name && u.display_name.toLowerCase().includes(q)) ||
      (u.client_ip && u.client_ip.toLowerCase().includes(q)) ||
      (u.device_fingerprint && u.device_fingerprint.toLowerCase().includes(q)) ||
      (u.latest_snippet && u.latest_snippet.toLowerCase().includes(q))
    );
  });

  const handleExportCsv = () => {
    if (!users || users.length === 0) return;
    let csv = 'Client ID,Display Name,IP Address,Device,First Seen,Last Seen,Total Messages,Total Visits\n';
    users.forEach(u => {
      csv += `"${u.client_id}","${u.display_name}","${u.client_ip}","${u.user_agent}","${u.first_seen}","${u.last_seen}",${u.total_messages},${u.total_visits}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxai_traffic_audit_${Date.now()}.csv`;
    a.click();
  };

  const handleIntercomSubmit = (e) => {
    e.preventDefault();
    if (!intercomMsg.trim()) return;
    if (onSendIntercom) onSendIntercom(intercomMsg.trim());
    setIntercomMsg('');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>User Traffic & Session History</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{users?.length || 0} unique visitors registered</span>
        </div>
        <button onClick={handleExportCsv} className="btn-ghost" style={{ fontSize: '12px', padding: '6px 12px' }}>
          <Download size={14} /> Export Audit CSV
        </button>
      </div>

      {/* Search Filter */}
      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-dim)' }} />
        <input
          type="text"
          placeholder="Filter users by client ID, IP address, device fingerprint, or snippet..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px 12px 42px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--border-glass)',
            color: '#FFFFFF',
            fontSize: '13px',
            outline: 'none'
          }}
        />
      </div>

      {/* Two Column Layout: User List + Session Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', height: '620px' }}>
        {/* User Sidebar */}
        <div className="glass-panel" style={{ overflowY: 'auto', padding: '12px' }}>
          {filteredUsers.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
              No matching visitors found.
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isSelected = selectedUser?.client_id === u.client_id;
              return (
                <div
                  key={u.client_id}
                  onClick={() => onSelectUser(u)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--border-accent)' : 'transparent'}`,
                    cursor: 'pointer',
                    marginBottom: '8px',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px' }}>{u.display_name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{u.total_messages || 0} msgs</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    IP: {u.client_ip || '127.0.0.1'}
                  </div>
                  {u.latest_snippet && (
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{u.latest_snippet}"
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Selected User Details & Intercom */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedUser ? (
            <>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>{selectedUser.display_name}</h4>
                    {selectedUser.is_banned && (
                      <span style={{ fontSize: '10px', fontWeight: '800', color: '#FDA4AF', background: 'rgba(244, 63, 94, 0.2)', border: '1px solid #F43F5E', padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase' }}>
                        Permanently Blacklisted
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    First Seen: {selectedUser.first_seen} • Last Active: {selectedUser.last_seen}
                  </div>

                  {/* Hardware Fingerprint */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>Hardware FP:</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#A5B4FC', background: 'rgba(99, 102, 241, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                      {selectedUser.device_fingerprint || 'Not captured yet'}
                    </span>
                    {selectedUser.device_fingerprint && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedUser.device_fingerprint);
                          setCopiedKey(selectedUser.device_fingerprint);
                          setTimeout(() => setCopiedKey(null), 2000);
                        }}
                        style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0 }}
                        title="Copy fingerprint"
                      >
                        {copiedKey === selectedUser.device_fingerprint ? <Check size={12} color="#34D399" /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onToggleBan(selectedUser)}
                  className="btn-ghost"
                  style={{
                    color: selectedUser.is_banned ? '#34D399' : '#F43F5E',
                    borderColor: selectedUser.is_banned ? 'rgba(52, 211, 153, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                    fontSize: '12px',
                    padding: '6px 12px'
                  }}
                >
                  {selectedUser.is_banned ? <UserCheck size={14} /> : <Ban size={14} />}
                  <span>{selectedUser.is_banned ? 'Lift Device Ban' : 'Permanently Ban Device'}</span>
                </button>
              </div>

              {/* Message Transcript */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(selectedUser.sessions || []).map((sess, sIdx) => (
                  <div key={sess.session_id || sIdx} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)', padding: '14px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Session #{sess.visit_number || sIdx + 1} ({sess.session_id})</span>
                      <span>{sess.started_at}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(sess.messages || []).map((msg, mIdx) => (
                        <div key={msg.id || mIdx} style={{ padding: '8px 12px', borderRadius: '8px', background: msg.is_intercom ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${msg.is_intercom ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.05)'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                            <strong style={{ color: msg.is_intercom ? '#818CF8' : '#38BDF8' }}>
                              {msg.is_intercom ? 'ADMIN INTERCOM' : 'USER'}
                            </strong>
                            <span style={{ color: 'var(--text-dim)' }}>{msg.timestamp}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#F1F5F9', marginBottom: msg.response ? '6px' : '0' }}>
                            {msg.query || msg.text}
                          </div>
                          {msg.response && (
                            <div style={{ fontSize: '12px', color: '#94A3B8', borderLeft: '2px solid #818CF8', paddingLeft: '8px', marginTop: '4px' }}>
                              <span style={{ fontSize: '10px', color: '#818CF8', display: 'block' }}>
                                BOT ({msg.engine || 'DNN'} • {msg.confidence}% confidence • {msg.latency_ms}ms)
                              </span>
                              {msg.response}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Intercom Dispatch */}
              <form onSubmit={handleIntercomSubmit} style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Send direct administrative intercom message to this user..."
                  value={intercomMsg}
                  onChange={(e) => setIntercomMsg(e.target.value)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: '#fff', fontSize: '13px' }}
                />
                <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                  <Send size={14} /> Send
                </button>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
              Select a visitor from the left to view full session transcript
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
