import React, { useState, useEffect } from 'react';
import AdminHeader from './admin/AdminHeader';
import AdminVitalsTab from './admin/AdminVitalsTab';
import AdminGovernanceTab from './admin/AdminGovernanceTab';
import AdminConversationsTab from './admin/AdminConversationsTab';
import AdminPlaygroundTab from './admin/AdminPlaygroundTab';
import AdminBlacklistTab from './admin/AdminBlacklistTab';

export default function AdminDashboard({
  token,
  onLogout,
  onClose
}) {
  const [activeTab, setActiveTab] = useState('vitals');
  const [vitals, setVitals] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [bannedList, setBannedList] = useState({});
  const [syncStatus, setSyncStatus] = useState('');

  // 1. Fetch System Vitals
  const fetchVitals = async () => {
    try {
      const res = await fetch('/api/admin/vitals', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setVitals(await res.json());
    } catch (e) {
      console.warn('Failed to fetch vitals:', e);
    }
  };

  // 2. Fetch User Conversations
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        if (data.users && data.users.length > 0 && !selectedUser) {
          handleSelectUser(data.users[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch user conversations:', e);
    }
  };

  const handleSelectUser = async (u) => {
    if (!u) return;
    setSelectedUser(u);
    try {
      const res = await fetch(`/api/admin/conversations/${u.client_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const detail = await res.json();
        setSelectedUser(detail);
      }
    } catch (e) {
      console.warn('Could not fetch detail for user:', e);
    }
  };

  // 3. Fetch System Configuration
  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.warn('Failed to fetch admin config:', e);
    }
  };

  // 4. Fetch Blacklist
  const fetchBannedList = async () => {
    try {
      const res = await fetch('/api/admin/banned', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBannedList(data.banned || {});
      }
    } catch (e) {
      console.warn('Failed to fetch banned list:', e);
    }
  };

  useEffect(() => {
    fetchVitals();
    fetchUsers();
    fetchConfig();
    fetchBannedList();
    const interval = setInterval(() => {
      fetchVitals();
    }, 12000);
    return () => clearInterval(interval);
  }, [token]);

  // Force S3 Sync
  const handleForceS3Sync = async () => {
    setSyncStatus('Syncing Cloud...');
    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSyncStatus('S3 Synced');
        setTimeout(() => setSyncStatus(''), 2500);
      }
    } catch (e) {
      setSyncStatus('Sync Failed');
      setTimeout(() => setSyncStatus(''), 2500);
    }
  };

  // Safe Logout: Terminates current session gracefully without emergency lockdown
  const handleSafeLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.warn('Logout error:', e);
    }
    onLogout();
  };

  // Emergency Lock: Revokes all active tokens immediately
  const handleEmergencyLock = async () => {
    if (!window.confirm('EMERGENCY LOCKDOWN: This will immediately revoke ALL active admin sessions and require master password re-authentication. Proceed?')) {
      return;
    }
    try {
      await fetch('/api/admin/emergency-lock', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.error('Emergency lock error:', e);
    }
    onLogout();
  };

  const handleToggleBan = async (user) => {
    if (!user) return;
    try {
      if (user.is_banned) {
        await fetch('/api/admin/unban', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ client_id: user.client_id })
        });
      } else {
        await fetch('/api/admin/ban', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            client_id: user.client_id,
            client_ip: user.client_ip,
            device_fingerprint: user.device_fingerprint,
            reason: 'Administrative policy violation: Manual blacklist'
          })
        });
      }
      fetchUsers();
      fetchBannedList();
    } catch (e) {
      console.error('Ban toggle error:', e);
    }
  };

  const handleSendIntercom = async (msg) => {
    if (!selectedUser || !msg) return;
    try {
      await fetch(`/api/admin/conversations/${selectedUser.client_id}/intercom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: msg })
      });
      handleSelectUser(selectedUser);
      fetchUsers();
    } catch (e) {
      console.error('Intercom error:', e);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 7, 14, 0.98)',
      backdropFilter: 'blur(30px)',
      WebkitBackdropFilter: 'blur(30px)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 99990,
      overflow: 'hidden'
    }}>
      {/* Top Navigation & Toolbar */}
      <AdminHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        syncStatus={syncStatus}
        onForceS3Sync={handleForceS3Sync}
        onSafeLogout={handleSafeLogout}
        onEmergencyLock={handleEmergencyLock}
        onClose={onClose}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {activeTab === 'vitals' && <AdminVitalsTab vitals={vitals} />}

        {activeTab === 'governance' && (
          <AdminGovernanceTab
            config={config}
            token={token}
            onConfigUpdated={fetchConfig}
            onPasswordChanged={(newToken) => {
              sessionStorage.setItem('voxai_admin_token', newToken);
              fetchConfig();
            }}
          />
        )}

        {activeTab === 'conversations' && (
          <AdminConversationsTab
            users={users}
            selectedUser={selectedUser}
            onSelectUser={handleSelectUser}
            onToggleBan={handleToggleBan}
            onSendIntercom={handleSendIntercom}
          />
        )}

        {activeTab === 'playground' && <AdminPlaygroundTab token={token} />}

        {activeTab === 'blacklist' && (
          <AdminBlacklistTab
            bannedList={bannedList}
            token={token}
            onRefresh={fetchBannedList}
          />
        )}
      </div>
    </div>
  );
}
