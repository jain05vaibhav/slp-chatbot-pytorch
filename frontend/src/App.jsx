import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import BroadcastBanner from './components/BroadcastBanner';
import ChatContainer from './components/ChatContainer';
import ModelInspector from './components/ModelInspector';
import MaintenanceOverlay from './components/MaintenanceOverlay';
import PublicLockoutOverlay from './components/PublicLockoutOverlay';
import AdminLoginModal from './components/AdminLoginModal';
import AdminDashboard from './components/AdminDashboard';
import BannedDeviceOverlay from './components/BannedDeviceOverlay';
import { getDeviceFingerprint } from './utils/fingerprint';

export default function App() {
  const [isOnline, setIsOnline] = useState(true);
  const [isGroqActive, setIsGroqActive] = useState(true);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [isTyping, setIsTyping] = useState(false);

  // Hardware Device Fingerprint & Blacklist State
  const [deviceFp, setDeviceFp] = useState(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banDetails, setBanDetails] = useState(null);
  const [clientIp, setClientIp] = useState('');

  // Client Identity & Session
  const [clientId] = useState(() => {
    let id = localStorage.getItem('voxai_client_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).substring(4);
      localStorage.setItem('voxai_client_id', id);
    }
    return id;
  });

  const [sessionId, setSessionId] = useState(() => {
    let id = sessionStorage.getItem('voxai_session_id');
    if (!id) {
      id = 'sess_' + Date.now();
      sessionStorage.setItem('voxai_session_id', id);
    }
    return id;
  });

  // Chat Messages (persisted in localStorage)
  const [messages, setMessages] = useState(() => {
    try {
      const stored = localStorage.getItem('voxai_active_chat');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Telemetry state
  const [telemetry, setTelemetry] = useState({
    engine: 'PyTorch DNN',
    intent: 'idle',
    confidence: 100,
    latency: 0
  });

  // Maintenance, Public Lockout & Admin Deck State
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [isPublicLockout, setIsPublicLockout] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [lockoutReason, setLockoutReason] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('voxai_admin_token') || null);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // Speech Recognition state
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);

  // Poll system status, maintenance, and public lockout
  const checkStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        setIsOnline(true);
        const data = await res.json();
        setIsMaintenance(Boolean(data.maintenance_mode));
        if (data.maintenance_message) setMaintenanceMessage(data.maintenance_message);
        if (data.public_lockout?.public_lockout) {
          setIsPublicLockout(true);
          setLockoutRemaining(data.public_lockout.public_lockout_remaining_seconds || 0);
          setLockoutReason(data.public_lockout.public_lockout_reason || '');
        } else {
          setIsPublicLockout(false);
        }
        setIsGroqActive(Boolean(data.groq_enabled));
      } else {
        setIsOnline(false);
      }
    } catch (e) {
      setIsOnline(false);
    }
  };

  // Preflight Hardware Ban Verification
  const checkBanStatus = async (fp) => {
    try {
      const activeFp = fp || deviceFp;
      const res = await fetch('/api/check-ban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({
          client_id: clientId,
          device_fingerprint: activeFp
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.is_banned) {
          setIsBanned(true);
          setBanReason(data.ban_reason || 'Device permanently blacklisted.');
          setBanDetails(data.ban_details || null);
          setClientIp(data.client_ip || '');
        } else {
          setIsBanned(false);
        }
      }
    } catch (e) {
      console.warn('Preflight ban check failed:', e);
    }
  };

  // Hardware Fingerprint Initialization on Boot
  useEffect(() => {
    let mounted = true;
    getDeviceFingerprint().then(fp => {
      if (mounted) {
        setDeviceFp(fp);
        checkBanStatus(fp);
      }
    });
    return () => { mounted = false; };
  }, [adminToken]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Check if opened via /admin URL or hotkeys
  useEffect(() => {
    if (window.location.pathname === '/admin') {
      if (adminToken) {
        setShowAdminDashboard(true);
      } else {
        setShowAdminLogin(true);
      }
    }

    const handleKeyDown = (e) => {
      if ((e.ctrlKey && e.altKey && e.code === 'KeyA') ||
          (e.ctrlKey && e.shiftKey && e.code === 'KeyA')) {
        e.preventDefault();
        if (adminToken) {
          setShowAdminDashboard(true);
        } else {
          setShowAdminLogin(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adminToken]);

  // Save messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('voxai_active_chat', JSON.stringify(messages));
    } catch (e) {}
  }, [messages]);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        setInterimTranscript('');
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setInterimTranscript(final || interim);
      };

      recognition.onerror = (event) => {
        console.warn('Speech error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (interimTranscript.trim()) {
          handleSendMessage(interimTranscript.trim());
          setInterimTranscript('');
        }
      };

      recognitionRef.current = recognition;
    }
  }, [interimTranscript]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported by your current browser.');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Text-to-Speech Vocalizer
  const speakText = (text) => {
    if (!isTtsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  // Send Message Handler
  const handleSendMessage = async (text) => {
    if (!text || !text.trim()) return;

    // Check dynamic secret passphrase via backend
    try {
      const phraseRes = await fetch('/api/admin/verify-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() })
      });
      if (phraseRes.ok) {
        const phraseData = await phraseRes.json();
        if (phraseData.is_secret) {
          if (adminToken) {
            setShowAdminDashboard(true);
          } else {
            setShowAdminLogin(true);
          }
          return;
        }
      }
    } catch (e) {
      if (text.trim().toLowerCase() === 'admin is here') {
        if (adminToken) setShowAdminDashboard(true);
        else setShowAdminLogin(true);
        return;
      }
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: 'msg_' + Date.now() + '_u',
      sender: 'user',
      text: text.trim(),
      timestamp: timeStr
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const payload = {
        text: text.trim(),
        use_groq: isGroqActive,
        client_id: clientId,
        session_id: sessionId,
        user_agent_label: 'Web Browser',
        device_fingerprint: deviceFp
      };

      const headers = { 'Content-Type': 'application/json' };
      if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      setIsTyping(false);

      if (res.status === 403) {
        const data = await res.json();
        if (data.is_banned) {
          setIsBanned(true);
          setBanReason(data.ban_reason || 'Device permanently blacklisted.');
          setBanDetails(data.ban_details || null);
          setClientIp(data.client_ip || '');
          return;
        }
      }

      if (res.status === 423) {
        const data = await res.json();
        setIsPublicLockout(true);
        setLockoutRemaining(data.lockout_remaining_seconds || 60);
        setLockoutReason(data.lockout_reason || '');
        return;
      }

      if (res.status === 503) {
        const data = await res.json();
        setIsMaintenance(true);
        if (data.response) setMaintenanceMessage(data.response);
        return;
      }

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();

      if (data.is_banned) {
        setIsBanned(true);
        setBanReason(data.ban_reason || 'Device permanently blacklisted.');
        setBanDetails(data.ban_details || null);
        setClientIp(data.client_ip || '');
        return;
      }

      const botReply = data.response || data.pytorch_base_response || 'Understood.';
      const botMsg = {
        id: 'msg_' + Date.now() + '_b',
        sender: 'bot',
        text: botReply,
        timestamp: timeStr,
        intent: data.intent,
        confidence: data.confidence,
        engine: data.engine || (isGroqActive ? 'Groq LLM' : 'PyTorch DNN')
      };

      setMessages(prev => [...prev, botMsg]);
      setTelemetry({
        engine: data.engine || (isGroqActive ? 'Groq LLM' : 'PyTorch DNN'),
        intent: data.intent || 'general',
        confidence: data.confidence || 100,
        latency: data.latency_ms || 1
      });

      speakText(botReply);
    } catch (err) {
      console.error(err);
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: 'msg_' + Date.now() + '_err',
        sender: 'bot',
        text: 'Apologies, I encountered an error connecting to the neural backend.',
        timestamp: timeStr,
        intent: 'error',
        confidence: 0,
        engine: 'Error'
      }]);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    localStorage.removeItem('voxai_active_chat');
    const newSess = 'sess_' + Date.now();
    setSessionId(newSess);
    sessionStorage.setItem('voxai_session_id', newSess);
  };

  const handleLoginSuccess = (newToken) => {
    setAdminToken(newToken);
    sessionStorage.setItem('voxai_admin_token', newToken);
    setShowAdminDashboard(true);
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('voxai_admin_token');
    setAdminToken(null);
    setShowAdminDashboard(false);
  };

  const handleIncomingIntercom = (newIntercomMsgs) => {
    if (!newIntercomMsgs || newIntercomMsgs.length === 0) return;
    newIntercomMsgs.forEach(item => {
      const intercomEntry = {
        id: item.id || 'intercom_' + Date.now() + Math.random().toString(36).substring(2, 6),
        sender: 'bot',
        text: `📢 [Admin Intercom]: ${item.text}`,
        timestamp: item.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: 'admin_intercom',
        confidence: 100,
        engine: 'Admin Dispatch'
      };
      setMessages(prev => {
        if (prev.some(m => m.id === intercomEntry.id)) return prev;
        return [...prev, intercomEntry];
      });
      speakText(`Admin notification: ${item.text}`);
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Real-time Broadcast Banner */}
      <BroadcastBanner
        clientId={clientId}
        onMaintenanceNotice={(maint, msg) => {
          setIsMaintenance(maint);
          if (msg) setMaintenanceMessage(msg);
        }}
        onIntercomMessages={handleIncomingIntercom}
      />

      {/* Top Navbar */}
      <Header
        isOnline={isOnline}
        isTtsEnabled={isTtsEnabled}
        setIsTtsEnabled={setIsTtsEnabled}
        isAdminActive={Boolean(adminToken)}
        onOpenAdmin={() => {
          if (adminToken) {
            setShowAdminDashboard(true);
          } else {
            setShowAdminLogin(true);
          }
        }}
      />

      {/* Main Body */}
      <main style={{
        flex: 1,
        maxWidth: '1440px',
        width: '100%',
        margin: '0 auto',
        padding: '24px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 340px',
        gap: '24px'
      }}>
        {/* Chat Stream Area */}
        <ChatContainer
          onSendMessage={handleSendMessage}
          messages={messages}
          onClearChat={handleClearChat}
          isRecording={isRecording}
          onToggleRecording={toggleRecording}
          interimTranscript={interimTranscript}
          isTyping={isTyping}
          speakText={speakText}
        />

        {/* Sidebar Telemetry Inspector */}
        <ModelInspector telemetry={telemetry} />
      </main>

      {/* Permanent Hardware Ban Lockdown Screen */}
      <BannedDeviceOverlay
        isBanned={isBanned}
        banReason={banReason}
        deviceFingerprint={deviceFp}
        clientIp={clientIp}
        banDetails={banDetails}
        onEmergencyUnbanSuccess={() => {
          setIsBanned(false);
          setBanReason('');
          setBanDetails(null);
          checkStatus();
        }}
      />

      {/* Maintenance Mode Overlay (Public only; authenticated admin bypasses) */}
      <MaintenanceOverlay
        isMaintenance={isMaintenance && !adminToken}
        customMessage={maintenanceMessage}
      />

      {/* Temporary Public Session Lockout Overlay with Live Countdown Clock */}
      <PublicLockoutOverlay
        isLockout={isPublicLockout && !adminToken}
        remainingSeconds={lockoutRemaining}
        lockoutReason={lockoutReason}
      />

      {/* Admin Master Password Clearance Modal */}
      <AdminLoginModal
        isOpen={showAdminLogin}
        onClose={() => setShowAdminLogin(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Admin Full-Screen Command Deck */}
      {showAdminDashboard && (
        <AdminDashboard
          token={adminToken}
          onLogout={handleAdminLogout}
          onClose={() => setShowAdminDashboard(false)}
        />
      )}
    </div>
  );
}
