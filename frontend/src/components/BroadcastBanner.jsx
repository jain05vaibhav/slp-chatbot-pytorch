import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Info, Flame } from 'lucide-react';

export default function BroadcastBanner({ clientId, onMaintenanceNotice, onIntercomMessages }) {
  const [broadcast, setBroadcast] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [lastMsg, setLastMsg] = useState('');

  const fetchBroadcast = async () => {
    try {
      const url = clientId ? `/api/broadcast?client_id=${encodeURIComponent(clientId)}` : '/api/broadcast';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      // Forward maintenance state immediately
      if (data.maintenance_mode !== undefined && onMaintenanceNotice) {
        onMaintenanceNotice(data.maintenance_mode, data.maintenance_message);
      }

      // Forward incoming intercom messages
      if (data.intercom_messages && data.intercom_messages.length > 0 && onIntercomMessages) {
        onIntercomMessages(data.intercom_messages);
      }

      // Forward broadcast banner
      if (data && data.enabled && data.message) {
        if (data.message !== lastMsg) {
          setDismissed(false);
          setLastMsg(data.message);
        }
        setBroadcast(data);
      } else {
        setBroadcast(null);
      }
    } catch (e) {
      console.warn('Broadcast check error:', e);
    }
  };

  useEffect(() => {
    fetchBroadcast();
    const interval = setInterval(fetchBroadcast, 5000);
    return () => clearInterval(interval);
  }, [clientId, lastMsg]);

  if (!broadcast || !broadcast.enabled || dismissed) return null;

  const themeStyles = {
    info: { bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.35)', color: '#A5B4FC', icon: Info },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)', color: '#FCD34D', icon: AlertTriangle },
    success: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.35)', color: '#6EE7B7', icon: CheckCircle },
    alert: { bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.35)', color: '#FDA4AF', icon: Flame },
  };

  const currentTheme = themeStyles[broadcast.theme] || themeStyles.info;
  const IconComponent = currentTheme.icon;

  return (
    <div style={{
      background: currentTheme.bg,
      borderBottom: `1px solid ${currentTheme.border}`,
      color: currentTheme.color,
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '13px',
      fontWeight: '600',
      backdropFilter: 'blur(10px)',
      position: 'relative',
      zIndex: 100,
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'center' }}>
        <IconComponent size={16} />
        <span>{broadcast.message}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss announcement"
        style={{
          background: 'none',
          border: 'none',
          color: currentTheme.color,
          cursor: 'pointer',
          padding: '4px',
          opacity: 0.8
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
