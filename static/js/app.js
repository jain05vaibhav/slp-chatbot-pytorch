document.addEventListener('DOMContentLoaded', () => {
  // DOM Element References
  const micButton = document.getElementById('micButton');
  const micIcon = document.getElementById('micIcon');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const messagesContainer = document.getElementById('messagesContainer');
  const speechStatusBar = document.getElementById('speechStatusBar');
  const speechStateText = document.getElementById('speechStateText');
  const transcriptPreview = document.getElementById('transcriptPreview');
  const audioWaveContainer = document.getElementById('audioWaveContainer');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const ttsToggle = document.getElementById('ttsToggle');
  const voiceSelect = document.getElementById('voiceSelect');
  const rateRange = document.getElementById('rateRange');
  const rateVal = document.getElementById('rateVal');
  const groqToggle = document.getElementById('groqToggle');
  const groqApiKeyInput = document.getElementById('groqApiKeyInput');
  const saveGroqKeyBtn = document.getElementById('saveGroqKeyBtn');

  // Model Inspector DOM Elements
  const inspectEngine = document.getElementById('inspectEngine');
  const inspectIntent = document.getElementById('inspectIntent');
  const inspectConfidence = document.getElementById('inspectConfidence');
  const inspectBar = document.getElementById('inspectBar');
  const inspectLatency = document.getElementById('inspectLatency');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  // App State Variables
  let isRecording = false;
  let isTtsEnabled = true;
  let isGroqEnabled = true;
  let customGroqApiKey = localStorage.getItem('voxai_groq_api_key') || '';
  let recognition = null;
  let synth = window.speechSynthesis;
  let voices = [];

  // Persistent User Identity & Session Tracking
  let clientId = localStorage.getItem('voxai_client_id');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).substring(4);
    localStorage.setItem('voxai_client_id', clientId);
  }

  let currentSessionId = sessionStorage.getItem('voxai_session_id');
  if (!currentSessionId) {
    currentSessionId = 'sess_' + Date.now();
    sessionStorage.setItem('voxai_session_id', currentSessionId);
  }

  // Device / Browser Metadata Label
  const userAgentLabel = (() => {
    const ua = navigator.userAgent;
    let browser = 'Browser';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';

    let os = 'OS';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return `${browser} on ${os}`;
  })();

  // Initialize custom Groq key input
  if (groqApiKeyInput && customGroqApiKey) {
    groqApiKeyInput.value = customGroqApiKey;
  }

  if (saveGroqKeyBtn && groqApiKeyInput) {
    saveGroqKeyBtn.addEventListener('click', () => {
      customGroqApiKey = groqApiKeyInput.value.trim();
      if (customGroqApiKey) {
        localStorage.setItem('voxai_groq_api_key', customGroqApiKey);
        saveGroqKeyBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #10B981;"></i>';
      } else {
        localStorage.removeItem('voxai_groq_api_key');
        saveGroqKeyBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
      }
      setTimeout(() => {
        saveGroqKeyBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
      }, 2000);
    });
  }

  // Update Groq UI Toggle state helper
  function updateGroqUI(isEnabled) {
    isGroqEnabled = isEnabled;
    localStorage.setItem('voxai_groq_mode', isEnabled ? 'true' : 'false');
    if (groqToggle) groqToggle.checked = isEnabled;
    const groqBadge = document.getElementById('groqBadge');
    const groqLabelText = document.getElementById('groqLabelText');
    if (groqBadge) {
      groqBadge.textContent = isEnabled ? 'ACTIVE' : 'OFFLINE';
      groqBadge.classList.toggle('active', isEnabled);
    }
    if (groqLabelText) {
      groqLabelText.textContent = isEnabled ? 'Groq Mode: Active' : 'Groq Mode: Inactive (Offline)';
    }
    if (statusText) {
      statusText.textContent = isEnabled ? 'PyTorch + Groq Engine Ready' : 'PyTorch Offline Engine Ready';
    }
    if (inspectEngine) {
      inspectEngine.textContent = isEnabled ? 'Groq LLM (High-Speed)' : 'PyTorch DNN (Offline)';
    }
  }

  // Groq mode is active by default
  updateGroqUI(true);

  // Restore client-side chat messages from previous session
  restoreSavedChat();

  // Health check to update status indicator
  function checkHealth() {
    fetch('/api/health')
      .then(res => {
        if (!res.ok) throw new Error(`Health status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (statusIndicator) {
          statusIndicator.classList.add('online');
          statusIndicator.classList.remove('offline');
        }
        if (statusText) {
          statusText.textContent = isGroqEnabled ? 'PyTorch + Groq Engine Ready' : 'PyTorch Offline Engine Ready';
        }
      })
      .catch(err => {
        console.warn('Health check fetch error:', err);
        if (statusIndicator) {
          statusIndicator.classList.remove('online');
          statusIndicator.classList.add('offline');
        }
        if (statusText) {
          statusText.textContent = 'Server Offline / Connecting...';
        }
      });
  }

  checkHealth();
  setInterval(checkHealth, 30000);

  // Initialize Speech Recognition API
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isRecording = true;
      micButton.classList.add('recording');
      speechStatusBar.classList.remove('hidden');
      audioWaveContainer.classList.remove('hidden');
      speechStateText.textContent = 'Listening to your voice... Speak now!';
      transcriptPreview.textContent = '"..."';
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const currentText = finalTranscript || interimTranscript;
      if (currentText) {
        transcriptPreview.textContent = `"${currentText}"`;
        userInput.value = currentText;
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech Recognition Error:', event.error);
      stopRecording();
      let errorMsg = `Speech error: ${event.error}.`;
      if (event.error === 'not-allowed') {
        errorMsg = 'Microphone permission denied. Please allow mic access in your browser.';
      } else if (event.error === 'no-speech') {
        errorMsg = 'No speech was detected. Please try again.';
      }
      speechStateText.textContent = errorMsg;
      setTimeout(() => {
        speechStatusBar.classList.add('hidden');
      }, 4000);
    };

    recognition.onend = () => {
      stopRecording();
      const text = userInput.value.trim ? userInput.value.trim() : userInput.value;
      if (text.length > 0) {
        if (text.toLowerCase() === 'admin is here') {
          userInput.value = '';
          openAdminAccess();
          return;
        }
        processUserQuery(text);
        userInput.value = '';
      }
    };
  } else {
    console.warn('Web Speech Recognition API is not supported in this browser.');
    if (speechStateText) {
      speechStateText.textContent = 'Speech Recognition API not supported in this browser. Use text input.';
    }
  }

  // Populate Speech Synthesis Voices
  function populateVoices() {
    if (!synth) return;
    voices = synth.getVoices();
    voiceSelect.innerHTML = '<option value="">Default System Voice</option>';
    voices.forEach((voice, i) => {
      const option = document.createElement('option');
      option.textContent = `${voice.name} (${voice.lang})`;
      option.value = i;
      if (voice.default) option.selected = true;
      voiceSelect.appendChild(option);
    });
  }

  populateVoices();
  if (synth && synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
  }

  // Toggle Recording State
  function toggleRecording() {
    if (!recognition) {
      alert('Speech Recognition is not supported by your current browser. Please type your message.');
      return;
    }
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.error('Mic start error:', err);
      }
    }
  }

  function stopRecording() {
    isRecording = false;
    micButton.classList.remove('recording');
    audioWaveContainer.classList.add('hidden');
    speechStatusBar.classList.add('hidden');
  }

  // Send Prompt to FastAPI Deep Learning Backend
  async function processUserQuery(text) {
    if (!text || !text.trim()) return;

    // Check for Secret Admin Phrase: "Admin is here"
    if (text.trim().toLowerCase() === 'admin is here') {
      openAdminAccess();
      return;
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Add User Message to UI
    appendMessage('user', text, timestamp);

    // 2. Show Typing Indicator placeholder
    const typingId = appendTypingIndicator();

    try {
      // 3. Call Backend FastAPI /api/chat endpoint with client identity & session tracking
      const payload = {
        text: text.trim(),
        use_groq: isGroqEnabled,
        client_id: clientId,
        session_id: currentSessionId,
        user_agent_label: userAgentLabel
      };
      if (customGroqApiKey) {
        payload.groq_api_key = customGroqApiKey;
      }

      const headers = { 'Content-Type': 'application/json' };
      const currentAdminToken = sessionStorage.getItem('voxai_admin_token');
      if (currentAdminToken) {
        headers['Authorization'] = `Bearer ${currentAdminToken}`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      removeTypingIndicator(typingId);

      if (!response.ok) {
        if (response.status === 503) {
          try {
            const data = await response.json();
            updateMaintenanceScreen(true, data.response || data.detail);
          } catch (e) {
            updateMaintenanceScreen(true);
          }
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Check if server is in Maintenance Mode
      if (data.is_maintenance || data.intent === 'maintenance') {
        updateMaintenanceScreen(true, data.response);
        return;
      }

      const botReply = (data.response && data.response.trim()) ? data.response : (data.pytorch_base_response || 'I understood your query.');
      const intentTag = data.intent;
      const confidence = data.confidence;
      const latency = data.latency_ms;
      const engineName = data.engine || 'PyTorch DNN';

      // 4. Add Bot Response to UI
      appendMessage('bot', botReply, timestamp, intentTag, confidence, engineName);

      // 5. Update Model Inspector Sidebar
      updateInspector(intentTag, confidence, latency, engineName);

      // 6. Speak Response via Speech Synthesis
      if (isTtsEnabled) {
        try {
          speakText(botReply);
        } catch (ttsErr) {
          console.warn('TTS playback error:', ttsErr);
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      removeTypingIndicator(typingId);
      appendMessage('bot', 'Apologies, I encountered an error connecting to the backend server.', timestamp, 'error', 0, 'Error');
    }
  }

  // Append Message to UI Stream
  function appendMessage(sender, text, timestamp, intentTag = '', confidence = 0, engine = '', saveToStorage = true) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');

    let metaHtml = '';
    let actionButtonsHtml = '';

    if (sender === 'bot') {
      metaHtml = `
        <div class="meta-tag">
          <span class="tag-pill intent-${intentTag}"><i class="fa-solid fa-tag"></i> ${intentTag}</span>
          <span class="tag-pill conf-pill"><i class="fa-solid fa-bolt"></i> ${confidence}% confidence</span>
          <span class="tag-pill engine-pill"><i class="fa-solid fa-microchip"></i> ${engine}</span>
        </div>
      `;
      actionButtonsHtml = `
        <button class="copy-msg-btn" title="Copy Response" style="background: none; border: none; color: var(--text-muted); cursor: pointer; margin-left: 6px; font-size: 12px;">
          <i class="fa-solid fa-copy"></i>
        </button>
        <button class="play-speech-btn" title="Speak Response" style="background: none; border: none; color: var(--text-muted); cursor: pointer; margin-left: 4px; font-size: 12px;">
          <i class="fa-solid fa-volume-high"></i>
        </button>
      `;
    }

    msgDiv.innerHTML = `
      <div class="avatar ${sender === 'user' ? 'user-avatar' : 'bot-avatar'}">
        <i class="fa-solid ${sender === 'user' ? 'fa-user' : 'fa-robot'}"></i>
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="sender-name">${sender === 'user' ? 'You (Voice Input)' : 'VoxAI Assistant'}</span>
          <span class="time-stamp">${timestamp} ${actionButtonsHtml}</span>
        </div>
        <div class="message-body">${escapeHtml(text)}</div>
        ${metaHtml}
      </div>
    `;

    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Attach click events
    const playBtn = msgDiv.querySelector('.play-speech-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => speakText(text));
    }

    const copyBtn = msgDiv.querySelector('.copy-msg-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #10B981;"></i>';
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
          }, 2000);
        }).catch(err => console.error('Failed to copy text: ', err));
      });
    }

    if (saveToStorage) {
      try {
        const stored = JSON.parse(localStorage.getItem('voxai_active_chat') || '[]');
        stored.push({ sender, text, timestamp, intentTag, confidence, engine });
        if (stored.length > 100) stored.splice(0, stored.length - 100);
        localStorage.setItem('voxai_active_chat', JSON.stringify(stored));
      } catch (e) {
        console.warn('Could not cache message to localStorage:', e);
      }
    }
  }

  // Restore client-side conversation on page refresh
  function restoreSavedChat() {
    try {
      const stored = JSON.parse(localStorage.getItem('voxai_active_chat') || '[]');
      if (Array.isArray(stored) && stored.length > 0) {
        stored.forEach(msg => {
          appendMessage(msg.sender, msg.text, msg.timestamp, msg.intentTag || '', msg.confidence || 0, msg.engine || '', false);
        });
      }
    } catch (e) {
      console.warn('Could not restore chat from localStorage:', e);
    }
  }

  // Typing Indicator Helper
  function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.id = id;
    typingDiv.classList.add('message', 'bot-message');
    typingDiv.innerHTML = `
      <div class="avatar bot-avatar"><i class="fa-solid fa-robot"></i></div>
      <div class="message-content">
        <div class="message-body" style="font-style: italic; color: var(--text-muted);">
          <i class="fa-solid fa-spinner fa-spin"></i> ${isGroqEnabled ? 'Groq LLM generating voice response...' : 'Neural network predicting response...'}
        </div>
      </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
  }

  function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // Update Model Inspector Panel
  function updateInspector(intent, confidence, latency, engine) {
    if (inspectEngine && engine) inspectEngine.textContent = engine;
    if (inspectIntent) inspectIntent.textContent = intent;
    if (inspectConfidence) inspectConfidence.textContent = `${confidence}%`;
    if (inspectBar) inspectBar.style.width = `${confidence}%`;
    if (inspectLatency) inspectLatency.textContent = `${latency} ms`;
  }

  // Speech Synthesis Playback Function
  function speakText(text) {
    if (!synth) return;
    synth.cancel(); // Stop ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = parseFloat(rateRange.value) || 1.0;

    const selectedVoiceIndex = voiceSelect.value;
    if (selectedVoiceIndex !== '' && voices[selectedVoiceIndex]) {
      utterance.voice = voices[selectedVoiceIndex];
    }

    synth.speak(utterance);
  }

  // Escape HTML helper
  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Event Listeners
  micButton.addEventListener('click', toggleRecording);

  function handleQuerySubmission() {
    const rawText = userInput.value;
    const text = rawText ? rawText.trim() : '';
    if (!text) return;

    // Secret Admin Trigger Phrase: "Admin is here"
    if (text.toLowerCase() === 'admin is here') {
      userInput.value = '';
      openAdminAccess();
      return;
    }

    processUserQuery(text);
    userInput.value = '';
  }

  sendBtn.addEventListener('click', handleQuerySubmission);

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuerySubmission();
    }
  });

  clearChatBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = '';
    try {
      localStorage.removeItem('voxai_active_chat');
    } catch (e) {}
    updateInspector('idle', 100, 0, 'PyTorch DNN');

    // Reset user session ID: For the user the chat starts fresh,
    // but the persistent clientId remains so the admin panel sees the returning user and logs new visits
    currentSessionId = 'sess_' + Date.now();
    sessionStorage.setItem('voxai_session_id', currentSessionId);
  });

  ttsToggle.addEventListener('click', () => {
    isTtsEnabled = !isTtsEnabled;
    ttsToggle.classList.toggle('active', isTtsEnabled);
    if (!isTtsEnabled && synth) synth.cancel();
  });

  rateRange.addEventListener('input', () => {
    rateVal.textContent = rateRange.value;
  });

  if (groqToggle) {
    groqToggle.addEventListener('change', (e) => {
      updateGroqUI(e.target.checked);
    });
  }

  // Preset Buttons Event Listeners
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-text');
      if (text) {
        processUserQuery(text);
      }
    });
  });

  // =========================================================================
  // MASTER ENCRYPTED ADMIN COMMAND CENTER CONTROLLER
  // =========================================================================

  // DOM Elements
  const brandSecretTrigger = document.getElementById('brandSecretTrigger');
  const adminAuthModal = document.getElementById('adminAuthModal');
  const closeAdminAuthBtn = document.getElementById('closeAdminAuthBtn');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const toggleAdminPwBtn = document.getElementById('toggleAdminPwBtn');
  const adminPwEyeIcon = document.getElementById('adminPwEyeIcon');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminAuthAlert = document.getElementById('adminAuthAlert');
  const adminAuthAlertMsg = document.getElementById('adminAuthAlertMsg');

  const adminCommandCenter = document.getElementById('adminCommandCenter');
  const closeAdminDashboardBtn = document.getElementById('closeAdminDashboardBtn');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const emergencyLockBtn = document.getElementById('emergencyLockBtn');
  const adminFloatingPill = document.getElementById('adminFloatingPill');
  const pillQuickLockBtn = document.getElementById('pillQuickLockBtn');
  const adminMaintBadge = document.getElementById('adminMaintBadge');
  const adminMaintText = document.getElementById('adminMaintText');

  // Tabs
  const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
  const adminPanels = document.querySelectorAll('.admin-panel');

  // Telemetry Tab Elements
  const refreshVitalsBtn = document.getElementById('refreshVitalsBtn');
  const hotReloadModelBtn = document.getElementById('hotReloadModelBtn');
  const triggerRetrainBtn = document.getElementById('triggerRetrainBtn');
  const retrainStatusBanner = document.getElementById('retrainStatusBanner');
  const retrainStatusTitle = document.getElementById('retrainStatusTitle');
  const retrainStatusDesc = document.getElementById('retrainStatusDesc');
  const statCpu = document.getElementById('statCpu');
  const statRam = document.getElementById('statRam');
  const statUptime = document.getElementById('statUptime');
  const statDevice = document.getElementById('statDevice');
  const statVocab = document.getElementById('statVocab');
  const statIntentsCount = document.getElementById('statIntentsCount');
  const statGroqStatus = document.getElementById('statGroqStatus');
  const statQueriesCount = document.getElementById('statQueriesCount');
  const statPythonVer = document.getElementById('statPythonVer');
  const statPlatform = document.getElementById('statPlatform');
  const statSessions = document.getElementById('statSessions');

  // Intents Tab Elements
  const intentsSearchInput = document.getElementById('intentsSearchInput');
  const addNewIntentBtn = document.getElementById('addNewIntentBtn');
  const saveIntentsBtn = document.getElementById('saveIntentsBtn');
  const intentsTableBody = document.getElementById('intentsTableBody');
  const intentEditModal = document.getElementById('intentEditModal');
  const closeIntentModalBtn = document.getElementById('closeIntentModalBtn');
  const cancelIntentEditBtn = document.getElementById('cancelIntentEditBtn');
  const saveIntentItemBtn = document.getElementById('saveIntentItemBtn');
  const intentModalTitle = document.getElementById('intentModalTitle');
  const intentTagInput = document.getElementById('intentTagInput');
  const intentPatternsInput = document.getElementById('intentPatternsInput');
  const intentResponsesInput = document.getElementById('intentResponsesInput');

  // Audit Tab Elements
  const refreshAuditBtn = document.getElementById('refreshAuditBtn');
  const exportAuditBtn = document.getElementById('exportAuditBtn');
  const clearAuditBtn = document.getElementById('clearAuditBtn');
  const auditTableBody = document.getElementById('auditTableBody');

  // Tuning Tab Elements
  const thresholdSlider = document.getElementById('thresholdSlider');
  const thresholdValBadge = document.getElementById('thresholdValBadge');
  const maintenanceToggle = document.getElementById('maintenanceToggle');
  const adminGroqKeyInput = document.getElementById('adminGroqKeyInput');
  const updateGroqKeyBtn = document.getElementById('updateGroqKeyBtn');
  const groqKeyStatusText = document.getElementById('groqKeyStatusText');
  const customPromptTextarea = document.getElementById('customPromptTextarea');
  const resetSystemPromptBtn = document.getElementById('resetSystemPromptBtn');
  const saveConfigBtn = document.getElementById('saveConfigBtn');

  // Security Tab Elements
  const changePasswordForm = document.getElementById('changePasswordForm');
  const oldPasswordInput = document.getElementById('oldPasswordInput');
  const newPasswordInput = document.getElementById('newPasswordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const submitChangePwBtn = document.getElementById('submitChangePwBtn');
  const changePwAlert = document.getElementById('changePwAlert');
  const securityLogsContainer = document.getElementById('securityLogsContainer');
  const refreshSecurityLogsBtn = document.getElementById('refreshSecurityLogsBtn');

  // New Feature Elements: Neural Playground, Broadcast, Moderation
  const forceSyncCloudBtn = document.getElementById('forceSyncCloudBtn');
  const adminTestPromptInput = document.getElementById('adminTestPromptInput');
  const runInferenceTestBtn = document.getElementById('runInferenceTestBtn');
  const playgroundResultsPanel = document.getElementById('playgroundResultsPanel');
  const resIntentTag = document.getElementById('resIntentTag');
  const resConfidenceBadge = document.getElementById('resConfidenceBadge');
  const resEngineTag = document.getElementById('resEngineTag');
  const resLatencyVal = document.getElementById('resLatencyVal');
  const resResponseText = document.getElementById('resResponseText');
  const topIntentsBarsContainer = document.getElementById('topIntentsBarsContainer');
  const matchedTokensContainer = document.getElementById('matchedTokensContainer');

  const maintCustomMessageInput = document.getElementById('maintCustomMessageInput');
  const broadcastToggle = document.getElementById('broadcastToggle');
  const broadcastMessageInput = document.getElementById('broadcastMessageInput');
  const broadcastThemeSelect = document.getElementById('broadcastThemeSelect');
  const saveBroadcastBtn = document.getElementById('saveBroadcastBtn');

  const publicBroadcastBanner = document.getElementById('publicBroadcastBanner');
  const publicBroadcastText = document.getElementById('publicBroadcastText');
  const broadcastTag = document.getElementById('broadcastTag');
  const dismissBroadcastBtn = document.getElementById('dismissBroadcastBtn');

  const exportAuditCsvBtn = document.getElementById('exportAuditCsvBtn');
  const userModerationBtns = document.getElementById('userModerationBtns');
  const banActiveUserBtn = document.getElementById('banActiveUserBtn');
  const banUserBtnText = document.getElementById('banUserBtnText');
  const deleteActiveUserBtn = document.getElementById('deleteActiveUserBtn');
  const conversationFilterBar = document.getElementById('conversationFilterBar');
  const userMessagesFilterInput = document.getElementById('userMessagesFilterInput');

  const maintSecretEmblem = document.getElementById('maintSecretEmblem');
  const maintTitle = document.getElementById('maintTitle');

  // Admin State
  let adminToken = sessionStorage.getItem('voxai_admin_token') || null;
  let allIntents = [];
  let editingIntentIndex = -1; // -1 = new intent, >= 0 = editing existing
  let vitalsPollInterval = null;
  let retrainPollInterval = null;
  let clickTimestamps = [];
  let maintTapTimestamps = [];

  // Helper: Get Admin Auth Header
  function getAdminHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken || ''}`
    };
  }

  // 1. SECRET GESTURE DETECTION
  // Gesture A: 5 rapid clicks/taps on brand logo within 2.5 seconds (Normal Page)
  if (brandSecretTrigger) {
    brandSecretTrigger.addEventListener('click', (e) => {
      const now = Date.now();
      clickTimestamps = clickTimestamps.filter(t => now - t < 2500);
      clickTimestamps.push(now);

      if (clickTimestamps.length >= 5) {
        clickTimestamps = [];
        brandSecretTrigger.style.filter = 'drop-shadow(0 0 15px #00F2FE)';
        setTimeout(() => { brandSecretTrigger.style.filter = ''; }, 800);
        openAdminAccess();
      }
    });
  }

  // Gesture B: Secret Maintenance Screen Gestures (NO visible shortcut displayed to visitors)
  function handleMaintSecretTap() {
    const now = Date.now();
    maintTapTimestamps = maintTapTimestamps.filter(t => now - t < 2500);
    maintTapTimestamps.push(now);

    if (maintSecretEmblem) {
      maintSecretEmblem.classList.add('secret-tap-pulse');
      setTimeout(() => maintSecretEmblem.classList.remove('secret-tap-pulse'), 350);
    }

    if (maintTapTimestamps.length >= 5) {
      maintTapTimestamps = [];
      openAdminAccess();
    }
  }

  if (maintSecretEmblem) {
    maintSecretEmblem.addEventListener('click', handleMaintSecretTap);
    
    // Long-press (1.8-second touch-and-hold for mobile screens)
    let longPressTimer = null;
    maintSecretEmblem.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => {
        handleMaintSecretTap();
        openAdminAccess();
      }, 1800);
    }, { passive: true });
    ['touchend', 'touchcancel', 'touchmove'].forEach(evt => {
      maintSecretEmblem.addEventListener(evt, () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }, { passive: true });
    });
  }

  if (maintTitle) {
    maintTitle.addEventListener('click', handleMaintSecretTap);
  }

  // Gesture C: Silent Keyboard Hotkey Ctrl + Alt + A, Ctrl + Shift + A, or Ctrl + Alt + M
  document.addEventListener('keydown', (e) => {
    const isModifier = e.ctrlKey || e.metaKey;
    const isAltOrShift = e.altKey || e.shiftKey;
    const key = e.key.toLowerCase();

    if (isModifier && isAltOrShift && (key === 'a' || key === 'm')) {
      e.preventDefault();
      openAdminAccess();
    } else if (e.key === 'Escape') {
      if (adminAuthModal && !adminAuthModal.classList.contains('hidden')) {
        closeAuthDialog();
      } else if (intentEditModal && !intentEditModal.classList.contains('hidden')) {
        intentEditModal.classList.add('hidden');
      } else if (adminCommandCenter && !adminCommandCenter.classList.contains('hidden')) {
        closeCommandCenter();
      }
    }
  });

  // Open Admin Entrypoint (Supports Direct /admin URL and Gestures)
  function openAdminAccess() {
    if (window.location.pathname !== '/admin') {
      try { history.pushState({ admin: true }, '', '/admin'); } catch (e) {}
    }
    if (adminToken) {
      // Validate current token
      fetch('/api/admin/verify', { headers: getAdminHeaders() })
        .then(res => {
          if (res.ok) {
            openCommandCenter();
          } else {
            sessionStorage.removeItem('voxai_admin_token');
            adminToken = null;
            openAuthDialog();
          }
        })
        .catch(() => openAuthDialog());
    } else {
      openAuthDialog();
    }
  }

  function openAuthDialog() {
    if (window.location.pathname !== '/admin') {
      try { history.pushState({ admin: true }, '', '/admin'); } catch (e) {}
    }
    adminAuthAlert.classList.add('hidden');
    adminPasswordInput.value = '';
    adminAuthModal.classList.remove('hidden');
    setTimeout(() => adminPasswordInput.focus(), 100);
  }

  function closeAuthDialog() {
    adminAuthModal.classList.add('hidden');
    if (window.location.pathname === '/admin' && (!adminCommandCenter || adminCommandCenter.classList.contains('hidden'))) {
      try { history.pushState(null, '', '/'); } catch (e) {}
    }
  }

  if (closeAdminAuthBtn) {
    closeAdminAuthBtn.addEventListener('click', closeAuthDialog);
  }

  // Toggle Password Mask
  if (toggleAdminPwBtn) {
    toggleAdminPwBtn.addEventListener('click', () => {
      const isPw = adminPasswordInput.type === 'password';
      adminPasswordInput.type = isPw ? 'text' : 'password';
      adminPwEyeIcon.classList.toggle('fa-eye', !isPw);
      adminPwEyeIcon.classList.toggle('fa-eye-slash', isPw);
    });
  }

  // 2. ADMIN AUTHENTICATION
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = adminPasswordInput.value;
      if (!password) return;

      adminLoginBtn.disabled = true;
      adminLoginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cryptographic Verification...';
      adminAuthAlert.classList.add('hidden');

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || 'Authentication failed.');
        }

        // Authentication Successful
        adminToken = data.token;
        sessionStorage.setItem('voxai_admin_token', adminToken);
        adminAuthModal.classList.add('hidden');
        adminFloatingPill.classList.remove('hidden');
        openCommandCenter();

      } catch (err) {
        adminAuthAlertMsg.textContent = err.message || 'Access Denied: Invalid credentials.';
        adminAuthAlert.classList.remove('hidden');
      } finally {
        adminLoginBtn.disabled = false;
        adminLoginBtn.innerHTML = '<i class="fa-solid fa-unlock-keyhole"></i> Decrypt &amp; Authenticate';
      }
    });
  }

  // Check persistent session on startup
  if (adminToken) {
    fetch('/api/admin/verify', { headers: getAdminHeaders() })
      .then(res => {
        if (res.ok) {
          adminFloatingPill.classList.remove('hidden');
        } else {
          sessionStorage.removeItem('voxai_admin_token');
          adminToken = null;
        }
      })
      .catch(() => {
        sessionStorage.removeItem('voxai_admin_token');
        adminToken = null;
      });
  }

  // 3. COMMAND CENTER MANAGEMENT & LIVE UPDATES
  const adminLiveSyncBadge = document.getElementById('adminLiveSyncBadge');
  const adminAutoLogoutText = document.getElementById('adminAutoLogoutText');
  const adminAutoLogoutBadge = document.getElementById('adminAutoLogoutBadge');
  const forceLogoutAllBtn = document.getElementById('forceLogoutAllBtn');

  let liveSyncInterval = null;
  let idleTimeSeconds = 0;
  const IDLE_LIMIT_SECONDS = 900; // 15 minutes of inactivity
  let idleTimerInterval = null;

  function resetIdleTimer() {
    idleTimeSeconds = 0;
    updateIdleTimerUI();
  }

  function updateIdleTimerUI() {
    if (!adminAutoLogoutText) return;
    const remaining = Math.max(0, IDLE_LIMIT_SECONDS - idleTimeSeconds);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    adminAutoLogoutText.textContent = `Auto-Lock: ${formatted}`;
    if (adminAutoLogoutBadge) {
      adminAutoLogoutBadge.classList.toggle('warning', remaining <= 60);
    }
  }

  function startIdleTimer() {
    resetIdleTimer();
    if (idleTimerInterval) clearInterval(idleTimerInterval);
    idleTimerInterval = setInterval(() => {
      if (!adminToken || adminCommandCenter.classList.contains('hidden')) {
        clearInterval(idleTimerInterval);
        idleTimerInterval = null;
        return;
      }
      idleTimeSeconds++;
      updateIdleTimerUI();
      if (idleTimeSeconds >= IDLE_LIMIT_SECONDS) {
        handleInactivityAutoLogout();
      }
    }, 1000);
  }

  function stopIdleTimer() {
    if (idleTimerInterval) {
      clearInterval(idleTimerInterval);
      idleTimerInterval = null;
    }
  }

  async function handleInactivityAutoLogout() {
    stopIdleTimer();
    stopLiveSync();
    try {
      await fetch('/api/admin/emergency-lock', { method: 'POST', headers: getAdminHeaders() });
    } catch (e) {}
    adminToken = null;
    sessionStorage.removeItem('voxai_admin_token');
    if (adminFloatingPill) adminFloatingPill.classList.add('hidden');
    closeCommandCenter();
    alert('Security Notice: Master administrative session auto-locked due to 15 minutes of inactivity.');
  }

  // Live Background Updates Heartbeat
  function startLiveSync() {
    if (liveSyncInterval) clearInterval(liveSyncInterval);
    liveSyncInterval = setInterval(async () => {
      if (!adminToken || adminCommandCenter.classList.contains('hidden')) {
        stopLiveSync();
        return;
      }
      await fetchVitals();

      // Live update whichever tab is currently active
      const activeBtn = document.querySelector('.admin-tab-btn.active');
      const activeTab = activeBtn ? activeBtn.getAttribute('data-tab') : null;
      if (activeTab === 'tab-audit') {
        if (currentAuditView === 'categorized') {
          loadCategorizedUsers(true);
        } else {
          loadAuditLogs(true);
        }
      } else if (activeTab === 'tab-security') {
        loadSecurityLogs();
      }
    }, 3500);
  }

  function stopLiveSync() {
    if (liveSyncInterval) {
      clearInterval(liveSyncInterval);
      liveSyncInterval = null;
    }
  }

  // Track user activity in admin console to reset idle timer
  if (adminCommandCenter) {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
      adminCommandCenter.addEventListener(evt, resetIdleTimer, { passive: true });
    });
  }

  function openCommandCenter() {
    if (window.location.pathname !== '/admin') {
      try { history.pushState({ admin: true }, '', '/admin'); } catch (e) {}
    }
    adminCommandCenter.classList.remove('hidden');
    if (maintenanceScreenOverlay) {
      maintenanceScreenOverlay.classList.add('hidden');
    }
    fetchVitals();
    loadConfig();

    // Start Live Synchronization & Auto-Logout Inactivity Monitor
    startLiveSync();
    startIdleTimer();
  }

  function closeCommandCenter() {
    adminCommandCenter.classList.add('hidden');
    if (window.location.pathname === '/admin') {
      try { history.pushState(null, '', '/'); } catch (e) {}
    }
    stopLiveSync();
    stopIdleTimer();
    if (isMaintenanceModeActive && maintenanceScreenOverlay) {
      maintenanceScreenOverlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  if (closeAdminDashboardBtn) {
    closeAdminDashboardBtn.addEventListener('click', closeCommandCenter);
  }

  if (adminFloatingPill) {
    adminFloatingPill.addEventListener('click', (e) => {
      if (e.target.closest('#pillQuickLockBtn')) return;
      openCommandCenter();
    });
  }

  if (pillQuickLockBtn) {
    pillQuickLockBtn.addEventListener('click', handleLogout);
  }

  // Tab Switching
  adminTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      adminTabBtns.forEach(b => b.classList.remove('active'));
      adminPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById(targetTab);
      if (panel) panel.classList.add('active');

      // Trigger lazy loads per tab
      if (targetTab === 'tab-telemetry') fetchVitals();
      else if (targetTab === 'tab-intents') loadIntents();
      else if (targetTab === 'tab-audit') loadAuditData();
      else if (targetTab === 'tab-tuning') loadConfig();
      else if (targetTab === 'tab-security') loadSecurityLogs();
    });
  });

  // Logout Handler
  async function handleLogout() {
    stopLiveSync();
    stopIdleTimer();
    try {
      await fetch('/api/admin/logout', { method: 'POST', headers: getAdminHeaders() });
    } catch (e) {
      console.warn('Logout notification error:', e);
    }
    adminToken = null;
    sessionStorage.removeItem('voxai_admin_token');
    adminFloatingPill.classList.add('hidden');
    closeCommandCenter();
    alert('Master administrative session securely revoked and locked.');
  }

  if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', handleLogout);

  // Force Logout All Sessions
  if (forceLogoutAllBtn) {
    forceLogoutAllBtn.addEventListener('click', async () => {
      if (!confirm('FORCE LOGOUT: Terminate ALL active administrator sessions globally across all devices immediately?')) return;
      forceLogoutAllBtn.disabled = true;
      forceLogoutAllBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Revoking...';
      try {
        await fetch('/api/admin/force-logout-all', { method: 'POST', headers: getAdminHeaders() });
      } catch (e) {
        console.warn('Force logout error:', e);
      } finally {
        forceLogoutAllBtn.disabled = false;
        forceLogoutAllBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Force Logout';
      }
      handleLogout();
    });
  }

  // Emergency Lockout
  if (emergencyLockBtn) {
    emergencyLockBtn.addEventListener('click', async () => {
      if (!confirm('EMERGENCY LOCKOUT: Revoke ALL active administrative sessions across all clients immediately?')) return;
      try {
        await fetch('/api/admin/emergency-lock', { method: 'POST', headers: getAdminHeaders() });
      } catch (e) {
        console.warn('Emergency lock error:', e);
      }
      handleLogout();
    });
  }

  // Popstate navigation listener (handles browser Back and Forward buttons)
  window.addEventListener('popstate', () => {
    if (window.location.pathname === '/admin') {
      openAdminAccess();
    } else {
      if (adminCommandCenter && !adminCommandCenter.classList.contains('hidden')) {
        closeCommandCenter();
      }
      if (adminAuthModal && !adminAuthModal.classList.contains('hidden')) {
        adminAuthModal.classList.add('hidden');
      }
    }
  });

  // Check initial route on page load (e.g. chatbot.vaibhavjain.click/admin)
  if (window.location.pathname === '/admin') {
    setTimeout(openAdminAccess, 150);
  }

  // 4. TAB 1: TELEMETRY & ENGINE DIAGNOSTICS
  async function fetchVitals() {
    if (!adminToken || adminCommandCenter.classList.contains('hidden')) return;
    try {
      const res = await fetch('/api/admin/vitals', { headers: getAdminHeaders() });
      if (!res.ok) {
        if (res.status === 401) handleSessionExpired();
        return;
      }
      const data = await res.json();

      statCpu.textContent = `${data.cpu_percent}%`;
      statRam.textContent = `${data.ram_used_percent}% / ${data.process_memory_mb} MB`;
      statUptime.textContent = data.uptime_human || `${data.uptime_seconds}s`;
      statDevice.textContent = data.model?.device || 'CPU';
      statVocab.textContent = `${data.model?.vocabulary_size || 0} features`;
      statIntentsCount.textContent = `${data.model?.intents_count || 0} tags`;
      statGroqStatus.textContent = data.groq?.configured ? 'Active' : 'Unconfigured';
      statQueriesCount.textContent = data.total_queries_logged || '0';

      statPythonVer.textContent = data.python_version || '-';
      statPlatform.textContent = data.platform || '-';
      statSessions.textContent = `${data.active_sessions_count || 1} active`;

      // Update maintenance badge
      if (adminMaintBadge && adminMaintText) {
        const isMaint = !!data.maintenance_mode;
        adminMaintBadge.classList.toggle('active', isMaint);
        adminMaintText.textContent = isMaint ? 'Maintenance Mode ACTIVE' : 'System Online';
      }

      // Check retraining status
      if (data.retrain_state?.is_running) {
        retrainStatusBanner.classList.remove('hidden', 'completed', 'failed');
        retrainStatusTitle.textContent = 'Retraining PyTorch Neural Network...';
        retrainStatusDesc.textContent = 'Optimizing deep learning weights across dataset epochs.';
      }

    } catch (err) {
      console.warn('Failed to fetch admin vitals:', err);
    }
  }

  if (refreshVitalsBtn) refreshVitalsBtn.addEventListener('click', fetchVitals);

  // Hot Reload Model
  if (hotReloadModelBtn) {
    hotReloadModelBtn.addEventListener('click', async () => {
      hotReloadModelBtn.disabled = true;
      hotReloadModelBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reloading...';
      try {
        const res = await fetch('/api/admin/reload', { method: 'POST', headers: getAdminHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Reload failed.');
        alert(`Model hot-reloaded successfully!\nVocabulary: ${data.vocabulary_size} features\nIntents: ${data.intents_count} tags`);
        fetchVitals();
      } catch (err) {
        alert(`Error reloading model: ${err.message}`);
      } finally {
        hotReloadModelBtn.disabled = false;
        hotReloadModelBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Hot Reload Weights';
      }
    });
  }

  // Trigger Model Retraining
  if (triggerRetrainBtn) {
    triggerRetrainBtn.addEventListener('click', async () => {
      if (!confirm('Initiate deep neural network retraining now? This will train on the current intents.json dataset.')) return;

      triggerRetrainBtn.disabled = true;
      try {
        const res = await fetch('/api/admin/retrain', { method: 'POST', headers: getAdminHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Could not start retraining.');

        retrainStatusBanner.classList.remove('hidden', 'completed', 'failed');
        retrainStatusTitle.textContent = 'Retraining in Progress...';
        retrainStatusDesc.textContent = 'Training PyTorch DNN in background thread...';

        // Poll retraining status
        pollRetrainStatus();
      } catch (err) {
        alert(`Retraining trigger error: ${err.message}`);
      } finally {
        triggerRetrainBtn.disabled = false;
      }
    });
  }

  function pollRetrainStatus() {
    if (retrainPollInterval) clearInterval(retrainPollInterval);
    retrainPollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/retrain-status', { headers: getAdminHeaders() });
        const st = await res.json();

        if (!st.is_running) {
          clearInterval(retrainPollInterval);
          retrainPollInterval = null;

          if (st.status === 'completed') {
            retrainStatusBanner.classList.add('completed');
            retrainStatusTitle.textContent = 'Retraining Completed Successfully!';
            retrainStatusDesc.textContent = 'PyTorch model weights refreshed and hot-reloaded.';
            fetchVitals();
            setTimeout(() => retrainStatusBanner.classList.add('hidden'), 6000);
          } else if (st.status === 'failed') {
            retrainStatusBanner.classList.add('failed');
            retrainStatusTitle.textContent = 'Retraining Failed';
            retrainStatusDesc.textContent = st.error || 'Unknown training error occurred.';
          }
        }
      } catch (e) {
        clearInterval(retrainPollInterval);
      }
    }, 1500);
  }

  // Force S3 Cloud Sync Handler
  if (forceSyncCloudBtn) {
    forceSyncCloudBtn.addEventListener('click', async () => {
      forceSyncCloudBtn.disabled = true;
      forceSyncCloudBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
      try {
        const res = await fetch('/api/admin/sync', { method: 'POST', headers: getAdminHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Sync failed.');
        alert(`S3 Cloud Synchronization Complete!\nConversations Synced: ${data.total_conversations}\nMaintenance Mode: ${data.maintenance_mode ? 'Active' : 'Off'}`);
        await fetchVitals();
        if (currentAuditView === 'categorized') loadCategorizedUsers();
      } catch (err) {
        alert('Cloud sync error: ' + err.message);
      } finally {
        forceSyncCloudBtn.disabled = false;
        forceSyncCloudBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Force S3 Sync';
      }
    });
  }

  // Interactive Neural Inference Playground & Debugger
  async function runInferencePlaygroundTest(queryText) {
    const text = (queryText || (adminTestPromptInput ? adminTestPromptInput.value : '')).trim();
    if (!text) {
      if (adminTestPromptInput) adminTestPromptInput.focus();
      return;
    }
    if (adminTestPromptInput) adminTestPromptInput.value = text;
    if (runInferenceTestBtn) {
      runInferenceTestBtn.disabled = true;
      runInferenceTestBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running...';
    }

    try {
      const res = await fetch('/api/admin/test-inference', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          text: text,
          threshold: thresholdSlider ? parseFloat(thresholdSlider.value) : 0.50,
          use_groq: false
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Inference test failed.');

      if (playgroundResultsPanel) playgroundResultsPanel.classList.remove('hidden');
      if (resIntentTag) resIntentTag.textContent = data.intent || 'fallback';
      if (resConfidenceBadge) {
        resConfidenceBadge.textContent = `${data.confidence}%`;
        resConfidenceBadge.style.color = data.confidence >= 50 ? '#10B981' : '#F59E0B';
      }
      if (resEngineTag) resEngineTag.textContent = data.engine || 'PyTorch DNN';
      if (resLatencyVal) resLatencyVal.textContent = `${data.latency_ms} ms`;
      if (resResponseText) resResponseText.textContent = data.response || '(No response returned)';

      // Render Top 5 Candidate Intent Probability Bars
      if (topIntentsBarsContainer) {
        topIntentsBarsContainer.innerHTML = '';
        const topIntents = data.top_intents || [];
        if (topIntents.length === 0) {
          topIntentsBarsContainer.innerHTML = '<div style="color: #64748B; font-size: 11px;">No candidate intent distribution available.</div>';
        } else {
          topIntents.forEach(item => {
            const row = document.createElement('div');
            row.className = 'intent-bar-row';
            row.innerHTML = `
              <span class="intent-bar-tag" title="${escapeHtml(item.tag)}">${escapeHtml(item.tag)}</span>
              <div class="intent-bar-track">
                <div class="intent-bar-fill" style="width: ${Math.min(100, Math.max(2, item.confidence))}%;"></div>
              </div>
              <span class="intent-bar-pct">${item.confidence}%</span>
            `;
            topIntentsBarsContainer.appendChild(row);
          });
        }
      }

      // Render Matched Vocabulary Tokens
      if (matchedTokensContainer) {
        matchedTokensContainer.innerHTML = '';
        const tokens = data.matched_tokens || [];
        if (tokens.length === 0) {
          matchedTokensContainer.innerHTML = '<span style="color: #EF4444; font-size: 11px;"><i class="fa-solid fa-triangle-exclamation"></i> Out of Vocabulary (OOV) - Zero N-gram overlap</span>';
        } else {
          tokens.forEach(tok => {
            const pill = document.createElement('span');
            pill.className = 'token-pill';
            pill.textContent = tok;
            matchedTokensContainer.appendChild(pill);
          });
        }
      }

    } catch (err) {
      alert(`Inference test failed: ${err.message}`);
    } finally {
      if (runInferenceTestBtn) {
        runInferenceTestBtn.disabled = false;
        runInferenceTestBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Run Model Test';
      }
    }
  }

  if (runInferenceTestBtn) {
    runInferenceTestBtn.addEventListener('click', () => runInferencePlaygroundTest());
  }

  if (adminTestPromptInput) {
    adminTestPromptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runInferencePlaygroundTest();
      }
    });
  }

  document.querySelectorAll('.quick-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) runInferencePlaygroundTest(prompt);
    });
  });
  async function loadIntents() {
    try {
      const res = await fetch('/api/admin/intents', { headers: getAdminHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      allIntents = data.intents || [];
      renderIntentsTable();
    } catch (err) {
      console.warn('Failed to load intents:', err);
    }
  }

  function renderIntentsTable() {
    const query = (intentsSearchInput ? intentsSearchInput.value : '').toLowerCase().trim();
    intentsTableBody.innerHTML = '';

    const filtered = allIntents.filter(item => {
      if (!query) return true;
      if (item.tag.toLowerCase().includes(query)) return true;
      if (item.patterns.some(p => p.toLowerCase().includes(query))) return true;
      if (item.responses.some(r => r.toLowerCase().includes(query))) return true;
      return false;
    });

    if (filtered.length === 0) {
      intentsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">No matching intents found.</td></tr>';
      return;
    }

    filtered.forEach((item, index) => {
      const realIndex = allIntents.indexOf(item);
      const tr = document.createElement('tr');

      const patternsHtml = item.patterns.slice(0, 4)
        .map(p => `<span class="pattern-chip">${escapeHtml(p)}</span>`).join('') +
        (item.patterns.length > 4 ? `<span class="pattern-chip">+${item.patterns.length - 4} more</span>` : '');

      const responseSnippet = item.responses[0] ? escapeHtml(item.responses[0].substring(0, 60)) + '...' : '-';

      tr.innerHTML = `
        <td><span class="tag-badge">${escapeHtml(item.tag)}</span></td>
        <td><div class="pattern-chip-list">${patternsHtml}</div></td>
        <td><span style="font-size: 11px; color: var(--text-muted);">${responseSnippet} (${item.responses.length})</span></td>
        <td style="text-align: right;">
          <button class="btn-table-action edit-intent" data-index="${realIndex}" title="Edit Intent"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-table-action delete delete-intent" data-index="${realIndex}" title="Delete Intent"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      `;

      intentsTableBody.appendChild(tr);
    });

    // Attach event listeners
    intentsTableBody.querySelectorAll('.edit-intent').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        openEditIntentModal(idx);
      });
    });

    intentsTableBody.querySelectorAll('.delete-intent').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        const tag = allIntents[idx]?.tag;
        if (confirm(`Are you sure you want to delete intent "${tag}"?`)) {
          allIntents.splice(idx, 1);
          renderIntentsTable();
        }
      });
    });
  }

  if (intentsSearchInput) {
    intentsSearchInput.addEventListener('input', renderIntentsTable);
  }

  // Open Edit/Add Intent Modal
  function openEditIntentModal(index = -1) {
    editingIntentIndex = index;
    if (index >= 0) {
      const item = allIntents[index];
      intentModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Intent: ${escapeHtml(item.tag)}`;
      intentTagInput.value = item.tag;
      intentPatternsInput.value = item.patterns.join('\n');
      intentResponsesInput.value = item.responses.join('\n');
    } else {
      intentModalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Add New Intent';
      intentTagInput.value = '';
      intentPatternsInput.value = '';
      intentResponsesInput.value = '';
    }
    intentEditModal.classList.remove('hidden');
    intentTagInput.focus();
  }

  if (addNewIntentBtn) addNewIntentBtn.addEventListener('click', () => openEditIntentModal(-1));
  if (closeIntentModalBtn) closeIntentModalBtn.addEventListener('click', () => intentEditModal.classList.add('hidden'));
  if (cancelIntentEditBtn) cancelIntentEditBtn.addEventListener('click', () => intentEditModal.classList.add('hidden'));

  // Save Intent Modal Item
  if (saveIntentItemBtn) {
    saveIntentItemBtn.addEventListener('click', () => {
      const tag = intentTagInput.value.trim().toLowerCase().replace(/\s+/g, '_');
      const patterns = intentPatternsInput.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      const responses = intentResponsesInput.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);

      if (!tag) {
        alert('Please enter a valid intent tag identifier.');
        return;
      }
      if (patterns.length === 0) {
        alert('Please provide at least one training pattern phrase.');
        return;
      }
      if (responses.length === 0) {
        alert('Please provide at least one bot response.');
        return;
      }

      const intentObj = { tag, patterns, responses };

      if (editingIntentIndex >= 0) {
        allIntents[editingIntentIndex] = intentObj;
      } else {
        // Check for duplicate tag
        if (allIntents.some(i => i.tag === tag)) {
          alert(`An intent with tag "${tag}" already exists. Please choose a unique tag or edit the existing one.`);
          return;
        }
        allIntents.push(intentObj);
      }

      intentEditModal.classList.add('hidden');
      renderIntentsTable();
    });
  }

  // Save & Sync Intents to Disk
  if (saveIntentsBtn) {
    saveIntentsBtn.addEventListener('click', async () => {
      saveIntentsBtn.disabled = true;
      saveIntentsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      try {
        const res = await fetch('/api/admin/intents', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ intents: allIntents })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to save dataset.');

        if (confirm(`Successfully saved ${data.total_intents} intents to intents.json!\n\nWould you like to trigger Neural Network retraining now to apply these changes?`)) {
          triggerRetrainBtn.click();
        }
      } catch (err) {
        alert(`Error saving intents: ${err.message}`);
      } finally {
        saveIntentsBtn.disabled = false;
        saveIntentsBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save &amp; Sync Dataset';
      }
    });
  }

  // 6. TAB 3: AUDIT STREAM & CATEGORIZED USER CONVERSATIONS
  const viewCategorizedBtn = document.getElementById('viewCategorizedBtn');
  const viewGlobalStreamBtn = document.getElementById('viewGlobalStreamBtn');
  const categorizedConversationsView = document.getElementById('categorizedConversationsView');
  const globalStreamContainer = document.getElementById('globalStreamContainer');
  const userDirectorySearch = document.getElementById('userDirectorySearch');
  const usersListContainer = document.getElementById('usersListContainer');
  const selectedUserHeader = document.getElementById('selectedUserHeader');
  const selectedUserAvatar = document.getElementById('selectedUserAvatar');
  const selectedUserName = document.getElementById('selectedUserName');
  const selectedUserSub = document.getElementById('selectedUserSub');
  const selectedUserStats = document.getElementById('selectedUserStats');
  const userSessionsStream = document.getElementById('userSessionsStream');

  let currentAuditView = 'categorized'; // 'categorized' | 'global'
  let allCategorizedUsers = [];
  let selectedClientId = null;

  // View toggle handlers
  if (viewCategorizedBtn && viewGlobalStreamBtn) {
    viewCategorizedBtn.addEventListener('click', () => {
      currentAuditView = 'categorized';
      viewCategorizedBtn.classList.add('active');
      viewGlobalStreamBtn.classList.remove('active');
      if (categorizedConversationsView) categorizedConversationsView.classList.remove('hidden');
      if (globalStreamContainer) globalStreamContainer.classList.add('hidden');
      loadCategorizedUsers();
    });

    viewGlobalStreamBtn.addEventListener('click', () => {
      currentAuditView = 'global';
      viewGlobalStreamBtn.classList.add('active');
      viewCategorizedBtn.classList.remove('active');
      if (categorizedConversationsView) categorizedConversationsView.classList.add('hidden');
      if (globalStreamContainer) globalStreamContainer.classList.remove('hidden');
      loadAuditLogs();
    });
  }

  // Master loader for audit tab
  async function loadAuditData() {
    if (currentAuditView === 'categorized') {
      await loadCategorizedUsers();
    } else {
      await loadAuditLogs();
    }
  }

  // Load Categorized Users from API
  async function loadCategorizedUsers() {
    try {
      const res = await fetch('/api/admin/conversations', { headers: getAdminHeaders() });
      if (!res.ok) {
        if (res.status === 401) handleSessionExpired();
        return;
      }
      const data = await res.json();
      allCategorizedUsers = data.users || [];
      renderUsersDirectory();

      // If a user was previously selected and is still in list, refresh their timeline
      if (selectedClientId && allCategorizedUsers.some(u => u.client_id === selectedClientId)) {
        selectUserForTimeline(selectedClientId);
      } else if (allCategorizedUsers.length > 0) {
        selectUserForTimeline(allCategorizedUsers[0].client_id);
      } else {
        selectedClientId = null;
        renderEmptyTimeline();
      }
    } catch (err) {
      console.warn('Failed to load categorized conversations:', err);
    }
  }

  function renderUsersDirectory() {
    if (!usersListContainer) return;
    const query = (userDirectorySearch ? userDirectorySearch.value : '').toLowerCase().trim();
    usersListContainer.innerHTML = '';

    const filtered = allCategorizedUsers.filter(u => {
      if (!query) return true;
      if (u.client_id && u.client_id.toLowerCase().includes(query)) return true;
      if (u.display_name && u.display_name.toLowerCase().includes(query)) return true;
      if (u.device_label && u.device_label.toLowerCase().includes(query)) return true;
      if (u.ip_address && u.ip_address.includes(query)) return true;
      if (u.latest_snippet && u.latest_snippet.toLowerCase().includes(query)) return true;
      return false;
    });

    if (filtered.length === 0) {
      usersListContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <i class="fa-solid fa-user-slash" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
          No visitors found.
        </div>
      `;
      return;
    }

    filtered.forEach(user => {
      const card = document.createElement('div');
      card.className = `user-profile-card ${user.client_id === selectedClientId ? 'active' : ''}`;
      card.dataset.clientId = user.client_id;

      const isReturning = user.total_visits > 1 || user.is_returning;
      const visitTagHtml = isReturning
        ? `<span class="user-visit-tag returning" title="Visitor has returned across sessions"><i class="fa-solid fa-arrows-rotate"></i> Returning (${user.total_visits} visits)</span>`
        : `<span class="user-visit-tag single-visit" title="First-time visitor"><i class="fa-solid fa-user-check"></i> 1 visit</span>`;

      const formattedTime = user.last_active ? formatRelativeTime(user.last_active) : '-';

      card.innerHTML = `
        <div class="user-card-top">
          <div class="user-card-id">
            <i class="fa-solid fa-user"></i>
            <span>${escapeHtml(user.display_name || user.client_id)}</span>
          </div>
          <span class="user-card-time">${formattedTime}</span>
        </div>
        <div class="user-card-meta">
          ${visitTagHtml}
          <span class="user-device-label" title="${escapeHtml(user.device_label || 'Unknown')}"><i class="fa-solid fa-desktop"></i> ${escapeHtml(user.device_label || 'Browser')}</span>
        </div>
        <div class="user-card-snippet">
          <i class="fa-solid fa-comment-dots" style="margin-right: 4px; opacity: 0.7;"></i>
          ${escapeHtml(user.latest_snippet ? `"${user.latest_snippet}"` : 'No messages yet')}
        </div>
      `;

      card.addEventListener('click', () => {
        selectUserForTimeline(user.client_id);
      });

      usersListContainer.appendChild(card);
    });
  }

  if (userDirectorySearch) {
    userDirectorySearch.addEventListener('input', renderUsersDirectory);
  }

  // Select User and Load their Continuous Multi-Session Timeline
  async function selectUserForTimeline(clientId) {
    selectedClientId = clientId;

    // Highlight card in directory
    if (usersListContainer) {
      usersListContainer.querySelectorAll('.user-profile-card').forEach(c => {
        c.classList.toggle('active', c.dataset.clientId === clientId);
      });
    }

    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(clientId)}`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error('User details not found');
      const user = await res.json();

      // Render Header
      if (selectedUserName) selectedUserName.textContent = user.display_name || user.client_id;
      if (selectedUserSub) {
        const firstSeen = user.created_at ? new Date(user.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
        selectedUserSub.textContent = `IP: ${user.ip_address || '127.0.0.1'} • ${user.device_label || 'Web Client'} • First visited: ${firstSeen}`;
      }

      if (userModerationBtns) userModerationBtns.classList.remove('hidden');
      if (conversationFilterBar) conversationFilterBar.classList.remove('hidden');
      if (userMessagesFilterInput) userMessagesFilterInput.value = '';

      if (banUserBtnText) {
        banUserBtnText.textContent = user.is_banned ? 'Unban User' : 'Ban User';
      }
      if (banActiveUserBtn) {
        banActiveUserBtn.style.background = user.is_banned ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
        banActiveUserBtn.style.color = user.is_banned ? '#34D399' : '#FCA5A5';
      }

      if (selectedUserStats) {
        const returningBadge = (user.total_visits > 1 || user.is_returning)
          ? `<span class="stat-badge returning"><i class="fa-solid fa-arrows-rotate"></i> Returning User (${user.total_visits} Visits)</span>`
          : `<span class="stat-badge initial"><i class="fa-solid fa-star"></i> Single Visit</span>`;

        const banBadge = user.is_banned
          ? `<span class="stat-badge" style="background: rgba(239,68,68,0.2); color: #EF4444; border: 1px solid rgba(239,68,68,0.4);"><i class="fa-solid fa-ban"></i> BANNED</span>`
          : '';

        selectedUserStats.innerHTML = `
          ${returningBadge}
          ${banBadge}
          <span class="stat-badge"><i class="fa-solid fa-comments"></i> ${user.total_queries || 0} Queries</span>
        `;
      }

      // Render Continuous Multi-Session Timeline
      renderSessionsStream(user);

    } catch (err) {
      console.warn('Failed to load user timeline:', err);
    }
  }

  function renderSessionsStream(user) {
    if (!userSessionsStream) return;
    userSessionsStream.innerHTML = '';

    const sessions = user.sessions || [];
    if (sessions.length === 0) {
      userSessionsStream.innerHTML = `
        <div class="empty-state-notice">
          <i class="fa-solid fa-comment-slash"></i>
          <p>No chat messages recorded for this user yet.</p>
        </div>
      `;
      return;
    }

    sessions.forEach(session => {
      // Session Divider
      const isRetVisit = session.is_returning_visit;
      const visitIndex = session.visit_index || 1;
      const startedStr = session.started_at ? new Date(session.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

      const divider = document.createElement('div');
      divider.className = `session-divider ${isRetVisit ? 'returning-divider' : 'first-divider'}`;
      divider.innerHTML = `
        <span class="session-divider-badge">
          <i class="fa-solid ${isRetVisit ? 'fa-arrows-rotate' : 'fa-door-open'}"></i>
          Visit #${visitIndex} ${isRetVisit ? '(Returning User Visit)' : '(Initial Visit Session)'}
        </span>
        <span class="session-time-badge">${startedStr}</span>
      `;
      userSessionsStream.appendChild(divider);

      // Session Chat Messages
      const messages = session.messages || [];
      if (messages.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.cssText = 'text-align: center; color: var(--text-muted); font-size: 11px; padding: 12px; font-style: italic;';
        emptyDiv.textContent = 'Session started without queries.';
        userSessionsStream.appendChild(emptyDiv);
      } else {
        messages.forEach(msg => {
          const exchangeDiv = document.createElement('div');
          exchangeDiv.className = 'chat-bubble-exchange';

          const confColor = msg.confidence >= 75 ? '#10B981' : (msg.confidence >= 50 ? '#F59E0B' : '#EF4444');

          exchangeDiv.innerHTML = `
            <div class="chat-bubble user-bubble">
              <div class="bubble-header">
                <span><i class="fa-solid fa-user"></i> ${escapeHtml(user.display_name)}</span>
                <span class="bubble-time">${escapeHtml(msg.timestamp || '')}</span>
              </div>
              <div class="bubble-text">${escapeHtml(msg.query)}</div>
            </div>
            <div class="chat-bubble bot-bubble">
              <div class="bubble-header">
                <span><i class="fa-solid fa-robot"></i> VoxAI Assistant</span>
                <span class="bubble-meta-pill">
                  <span class="intent-pill">${escapeHtml(msg.intent || 'unknown')}</span>
                  <span style="color: ${confColor}; font-weight: 700;">${msg.confidence || 0}%</span>
                  <span>${escapeHtml(msg.engine || 'PyTorch DNN')}</span>
                  <span>${msg.latency_ms || 0}ms</span>
                </span>
              </div>
              <div class="bubble-text">${escapeHtml(msg.response)}</div>
            </div>
          `;
          userSessionsStream.appendChild(exchangeDiv);
        });
      }
    });

    userSessionsStream.scrollTop = userSessionsStream.scrollHeight;
  }

  function renderEmptyTimeline() {
    if (selectedUserName) selectedUserName.textContent = 'No Visitor Selected';
    if (selectedUserSub) selectedUserSub.textContent = 'Select a visitor from the directory on the left';
    if (selectedUserStats) selectedUserStats.innerHTML = '';
    if (userSessionsStream) {
      userSessionsStream.innerHTML = `
        <div class="empty-state-notice">
          <i class="fa-solid fa-comments"></i>
          <p>No user conversations logged yet. Conversations will automatically appear here categorized by visitor identity.</p>
        </div>
      `;
    }
  }

  function formatRelativeTime(dateInput) {
    try {
      const date = new Date(dateInput);
      const now = new Date();
      const diffSecs = Math.floor((now - date) / 1000);
      if (diffSecs < 60) return 'Just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  // Flat Global Audit Logs Table
  async function loadAuditLogs() {
    try {
      const res = await fetch('/api/admin/query-logs', { headers: getAdminHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const logs = data.logs || [];

      auditTableBody.innerHTML = '';
      if (logs.length === 0) {
        auditTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No chat query traffic recorded yet.</td></tr>';
        return;
      }

      logs.forEach(log => {
        const tr = document.createElement('tr');
        const confColor = log.confidence >= 75 ? '#10B981' : (log.confidence >= 50 ? '#F59E0B' : '#EF4444');
        const identityLabel = log.client_id ? (log.client_id.length > 14 ? log.client_id.substring(0, 12) + '...' : log.client_id) : 'Anonymous';

        tr.innerHTML = `
          <td style="font-family: monospace; color: var(--text-muted); font-size: 11px;">${escapeHtml(log.timestamp)}</td>
          <td><span style="font-family: monospace; font-size: 11px; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;" title="${escapeHtml(log.client_id || '')}"><i class="fa-solid fa-user" style="font-size: 10px; margin-right: 4px; color: var(--accent);"></i>${escapeHtml(identityLabel)}</span></td>
          <td><strong style="color: var(--text-main);">${escapeHtml(log.query)}</strong></td>
          <td><span class="tag-badge">${escapeHtml(log.intent)}</span></td>
          <td><span style="color: ${confColor}; font-weight: 700;">${log.confidence}%</span></td>
          <td><span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(log.engine)}</span></td>
          <td style="font-family: monospace; font-size: 11px;">${log.latency_ms} ms</td>
        `;
        auditTableBody.appendChild(tr);
      });
    } catch (err) {
      console.warn('Failed to load audit logs:', err);
    }
  }

  if (refreshAuditBtn) {
    refreshAuditBtn.addEventListener('click', () => {
      if (currentAuditView === 'categorized') {
        loadCategorizedUsers();
      } else {
        loadAuditLogs();
      }
    });
  }

  if (clearAuditBtn) {
    clearAuditBtn.addEventListener('click', async () => {
      if (!confirm('Clear all conversation history and query audit records?')) return;
      try {
        await Promise.all([
          fetch('/api/admin/conversations', { method: 'DELETE', headers: getAdminHeaders() }),
          fetch('/api/admin/query-logs', { method: 'DELETE', headers: getAdminHeaders() })
        ]);
        allCategorizedUsers = [];
        selectedClientId = null;
        renderUsersDirectory();
        renderEmptyTimeline();
        loadAuditLogs();
      } catch (e) {
        alert('Failed to clear conversations: ' + e.message);
      }
    });
  }

  if (exportAuditBtn) {
    exportAuditBtn.addEventListener('click', async () => {
      try {
        if (currentAuditView === 'categorized') {
          const res = await fetch('/api/admin/conversations', { headers: getAdminHeaders() });
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data.users, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `voxai_categorized_conversations_${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          const res = await fetch('/api/admin/query-logs?limit=500', { headers: getAdminHeaders() });
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data.logs, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `voxai_audit_logs_${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        alert('Failed to export data: ' + err.message);
      }
    });
  }

  if (exportAuditCsvBtn) {
    exportAuditCsvBtn.addEventListener('click', async () => {
      try {
        exportAuditCsvBtn.disabled = true;
        exportAuditCsvBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';
        const res = await fetch('/api/admin/conversations', { headers: getAdminHeaders() });
        const data = await res.json();
        const users = data.users || [];

        const rows = [["Client ID", "Display Name", "IP Address", "Device", "Session ID", "Visit #", "Timestamp", "User Query", "Predicted Intent", "Confidence %", "Engine", "Latency (ms)", "Bot Response"]];

        users.forEach(u => {
          (u.sessions || []).forEach(s => {
            (s.messages || []).forEach(m => {
              rows.push([
                u.client_id || '',
                u.display_name || '',
                u.client_ip || '',
                u.user_agent || '',
                s.session_id || '',
                s.visit_number || 1,
                m.timestamp || '',
                `"${(m.query || '').replace(/"/g, '""')}"`,
                m.intent || '',
                m.confidence || '',
                m.engine || '',
                m.latency_ms || '',
                `"${(m.response || '').replace(/"/g, '""')}"`
              ]);
            });
          });
        });

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `voxai_user_conversations_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        alert('Export CSV error: ' + err.message);
      } finally {
        exportAuditCsvBtn.disabled = false;
        exportAuditCsvBtn.innerHTML = '<i class="fa-solid fa-file-csv"></i> Export CSV';
      }
    });
  }

  // Live filter messages within active conversation stream
  if (userMessagesFilterInput) {
    userMessagesFilterInput.addEventListener('input', () => {
      const q = userMessagesFilterInput.value.toLowerCase().trim();
      const messageCards = document.querySelectorAll('.session-msg-card');
      messageCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    });
  }

  // Ban / Unban Active User Handler
  if (banActiveUserBtn) {
    banActiveUserBtn.addEventListener('click', async () => {
      if (!selectedClientId) return;
      const user = allCategorizedUsers.find(u => u.client_id === selectedClientId);
      const isCurrentlyBanned = user && user.is_banned;

      if (isCurrentlyBanned) {
        if (!confirm(`Unban user ${user.display_name}?`)) return;
        try {
          const res = await fetch('/api/admin/unban', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ client_id: selectedClientId })
          });
          if (!res.ok) throw new Error('Unban failed.');
          alert(`User ${user.display_name} unbanned.`);
          loadCategorizedUsers();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      } else {
        const reason = prompt(`Enter ban reason for ${user ? user.display_name : selectedClientId}:`, "Administrative policy violation");
        if (reason === null) return;
        try {
          const res = await fetch('/api/admin/ban', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({
              client_id: selectedClientId,
              client_ip: user ? user.client_ip : undefined,
              reason: reason || "Administrative policy violation"
            })
          });
          if (!res.ok) throw new Error('Ban failed.');
          alert(`User ${user ? user.display_name : selectedClientId} has been banned.`);
          loadCategorizedUsers();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }
    });
  }

  // Delete Active User Profile Handler
  if (deleteActiveUserBtn) {
    deleteActiveUserBtn.addEventListener('click', async () => {
      if (!selectedClientId) return;
      const user = allCategorizedUsers.find(u => u.client_id === selectedClientId);
      if (!confirm(`Are you sure you want to permanently delete user ${user ? user.display_name : selectedClientId} and all their session history?`)) return;
      try {
        const res = await fetch(`/api/admin/conversations/${encodeURIComponent(selectedClientId)}`, {
          method: 'DELETE',
          headers: getAdminHeaders()
        });
        if (!res.ok) throw new Error('Delete user failed.');
        selectedClientId = null;
        loadCategorizedUsers();
      } catch (err) {
        alert('Error deleting user: ' + err.message);
      }
    });
  }

  // 7. TAB 4: ENGINE HYPERPARAMETERS & TUNING
  async function loadConfig() {
    try {
      const res = await fetch('/api/admin/config', { headers: getAdminHeaders() });
      if (!res.ok) return;
      const cfg = await res.json();

      if (thresholdSlider) {
        thresholdSlider.value = cfg.confidence_threshold;
        thresholdValBadge.textContent = `${Math.round(cfg.confidence_threshold * 100)}%`;
      }
      if (maintenanceToggle) {
        maintenanceToggle.checked = !!cfg.maintenance_mode;
      }
      if (maintCustomMessageInput) {
        maintCustomMessageInput.value = cfg.maintenance_message || '';
      }
      if (customPromptTextarea) {
        customPromptTextarea.value = cfg.custom_system_prompt || '';
      }
      if (groqKeyStatusText) {
        groqKeyStatusText.textContent = cfg.groq_key_masked || 'Not Configured';
      }
      loadPublicBroadcast();
    } catch (err) {
      console.warn('Failed to load admin config:', err);
    }
  }

  if (maintenanceToggle) {
    maintenanceToggle.addEventListener('change', async () => {
      const isMaint = maintenanceToggle.checked;
      try {
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({
            maintenance_mode: isMaint,
            maintenance_message: maintCustomMessageInput ? maintCustomMessageInput.value.trim() : undefined
          })
        });
        if (res.ok) {
          updateMaintenanceScreen(isMaint, maintCustomMessageInput ? maintCustomMessageInput.value.trim() : undefined);
          fetchVitals();
        }
      } catch (err) {
        console.error('Failed to update maintenance mode:', err);
      }
    });
  }

  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', (e) => {
      thresholdValBadge.textContent = `${Math.round(e.target.value * 100)}%`;
    });
  }

  if (resetSystemPromptBtn) {
    resetSystemPromptBtn.addEventListener('click', () => {
      customPromptTextarea.value = '';
    });
  }

  if (updateGroqKeyBtn) {
    updateGroqKeyBtn.addEventListener('click', async () => {
      const newKey = adminGroqKeyInput.value.trim();
      if (!newKey) {
        alert('Please enter a valid Groq API key.');
        return;
      }
      try {
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ groq_api_key: newKey })
        });
        if (!res.ok) throw new Error('Failed to update key.');
        alert('Server-wide Groq API key updated successfully!');
        adminGroqKeyInput.value = '';
        loadConfig();
      } catch (err) {
        alert(`Error updating Groq key: ${err.message}`);
      }
    });
  }

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
      saveConfigBtn.disabled = true;
      saveConfigBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

      const payload = {
        confidence_threshold: parseFloat(thresholdSlider.value),
        maintenance_mode: maintenanceToggle.checked,
        maintenance_message: maintCustomMessageInput ? maintCustomMessageInput.value.trim() : undefined,
        custom_system_prompt: customPromptTextarea.value.trim()
      };

      try {
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to save configuration.');
        updateMaintenanceScreen(maintenanceToggle.checked, maintCustomMessageInput ? maintCustomMessageInput.value.trim() : undefined);
        alert('System hyperparameters and maintenance state updated successfully!');
        fetchVitals();
      } catch (err) {
        alert(`Error saving configuration: ${err.message}`);
      } finally {
        saveConfigBtn.disabled = false;
        saveConfigBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Save Engine Configuration';
      }
    });
  }

  // Public Broadcast Banner Manager
  async function loadPublicBroadcast() {
    try {
      const res = await fetch('/api/broadcast');
      if (!res.ok) return;
      const b = await res.json();
      const isDismissed = sessionStorage.getItem('voxai_broadcast_dismissed');
      if (b.enabled && b.message && !isDismissed) {
        if (publicBroadcastText) publicBroadcastText.textContent = b.message;
        if (publicBroadcastBanner) {
          publicBroadcastBanner.className = `public-broadcast-banner theme-${b.theme || 'info'}`;
          publicBroadcastBanner.classList.remove('hidden');
        }
      } else {
        if (publicBroadcastBanner) publicBroadcastBanner.classList.add('hidden');
      }

      // Sync Admin form controls if open
      if (broadcastToggle) broadcastToggle.checked = !!b.enabled;
      if (broadcastMessageInput && !broadcastMessageInput.value) broadcastMessageInput.value = b.message || '';
      if (broadcastThemeSelect && b.theme) broadcastThemeSelect.value = b.theme;
    } catch (e) {
      console.warn('Failed to load public broadcast:', e);
    }
  }

  if (dismissBroadcastBtn) {
    dismissBroadcastBtn.addEventListener('click', () => {
      if (publicBroadcastBanner) publicBroadcastBanner.classList.add('hidden');
      sessionStorage.setItem('voxai_broadcast_dismissed', 'true');
    });
  }

  if (saveBroadcastBtn) {
    saveBroadcastBtn.addEventListener('click', async () => {
      const enabled = broadcastToggle ? broadcastToggle.checked : false;
      const message = broadcastMessageInput ? broadcastMessageInput.value.trim() : '';
      const theme = broadcastThemeSelect ? broadcastThemeSelect.value : 'info';

      if (enabled && !message) {
        alert('Please enter an announcement message before publishing.');
        return;
      }

      saveBroadcastBtn.disabled = true;
      saveBroadcastBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...';
      try {
        const res = await fetch('/api/admin/broadcast', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ enabled, message, theme })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to update broadcast.');
        sessionStorage.removeItem('voxai_broadcast_dismissed');
        loadPublicBroadcast();
        alert('Public broadcast announcement banner updated successfully!');
      } catch (err) {
        alert(`Error updating broadcast: ${err.message}`);
      } finally {
        saveBroadcastBtn.disabled = false;
        saveBroadcastBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publish Banner';
      }
    });
  }

  // 8. TAB 5: SECURITY VAULT
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPw = oldPasswordInput.value;
      const newPw = newPasswordInput.value;
      const confirmPw = confirmPasswordInput.value;

      changePwAlert.classList.add('hidden', 'success', 'error');

      if (newPw !== confirmPw) {
        changePwAlert.textContent = 'New passwords do not match.';
        changePwAlert.classList.remove('hidden');
        changePwAlert.classList.add('error');
        return;
      }

      if (newPw.length < 8) {
        changePwAlert.textContent = 'New password must be at least 8 characters long.';
        changePwAlert.classList.remove('hidden');
        changePwAlert.classList.add('error');
        return;
      }

      submitChangePwBtn.disabled = true;
      submitChangePwBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Re-encrypting Vault...';

      try {
        const res = await fetch('/api/admin/change-password', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ old_password: oldPw, new_password: newPw })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Password change failed.');

        // Update active session token
        if (data.new_token) {
          adminToken = data.new_token;
          sessionStorage.setItem('voxai_admin_token', adminToken);
        }

        changePwAlert.textContent = 'Master password successfully updated! Credentials re-encrypted with PBKDF2.';
        changePwAlert.classList.remove('hidden');
        changePwAlert.classList.add('success');
        changePasswordForm.reset();
        loadSecurityLogs();
      } catch (err) {
        changePwAlert.textContent = err.message || 'Failed to change password.';
        changePwAlert.classList.remove('hidden');
        changePwAlert.classList.add('error');
      } finally {
        submitChangePwBtn.disabled = false;
        submitChangePwBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Update Master Password';
      }
    });
  }

  async function loadSecurityLogs() {
    try {
      const res = await fetch('/api/admin/security-logs', { headers: getAdminHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const logs = data.logs || [];

      securityLogsContainer.innerHTML = '';
      if (logs.length === 0) {
        securityLogsContainer.innerHTML = '<div style="padding: 16px; color: var(--text-muted); text-align: center;">No security events recorded.</div>';
        return;
      }

      logs.forEach(item => {
        const div = document.createElement('div');
        div.className = 'sec-log-entry';
        const formattedTime = item.timestamp ? new Date(item.timestamp).toLocaleString() : '-';
        div.innerHTML = `
          <span class="sec-log-badge ${item.event}">${escapeHtml(item.event)}</span>
          <span class="sec-log-text">${escapeHtml(item.details || '')}</span>
          <span class="sec-log-time">${formattedTime}</span>
        `;
        securityLogsContainer.appendChild(div);
      });
    } catch (err) {
      console.warn('Failed to load security logs:', err);
    }
  }

  if (refreshSecurityLogsBtn) refreshSecurityLogsBtn.addEventListener('click', loadSecurityLogs);

  let consecutive401Count = 0;
  function handleSessionExpired() {
    consecutive401Count++;
    if (consecutive401Count < 2) {
      console.warn('Transient 401 detected, retrying before expiring session...');
      return;
    }
    consecutive401Count = 0;
    adminToken = null;
    sessionStorage.removeItem('voxai_admin_token');
    if (adminFloatingPill) adminFloatingPill.classList.add('hidden');
    closeCommandCenter();
    if (isMaintenanceModeActive && maintenanceScreenOverlay) {
      maintenanceScreenOverlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
    alert('Your admin session has expired. Please re-authenticate.');
  }

  // =========================================================================
  // FULL SCREEN FORCED MAINTENANCE SHIELD CONTROLLER
  // =========================================================================
  const maintenanceScreenOverlay = document.getElementById('maintenanceScreenOverlay');
  const maintAdminUnlockBtn = document.getElementById('maintAdminUnlockBtn');
  const maintPollingText = document.getElementById('maintPollingText');
  const maintSubtitle = document.getElementById('maintSubtitle');
  let isMaintenanceModeActive = false;

  function updateMaintenanceScreen(active, customMessage) {
    isMaintenanceModeActive = !!active;

    // Toggle Input & Interaction Lockdown
    if (userInput) {
      userInput.disabled = isMaintenanceModeActive;
      userInput.placeholder = isMaintenanceModeActive
        ? "Platform locked: System maintenance mode is active..."
        : "Speak into mic or type your prompt here...";
      if (isMaintenanceModeActive) userInput.blur();
    }
    if (sendBtn) sendBtn.disabled = isMaintenanceModeActive;
    if (micButton) {
      micButton.disabled = isMaintenanceModeActive;
      micButton.classList.toggle('lockdown-disabled', isMaintenanceModeActive);
    }
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.disabled = isMaintenanceModeActive;
      btn.classList.toggle('lockdown-disabled', isMaintenanceModeActive);
    });

    if (maintenanceScreenOverlay) {
      const isConsoleOpen = adminCommandCenter && !adminCommandCenter.classList.contains('hidden');
      const isAuthModalOpen = adminAuthModal && !adminAuthModal.classList.contains('hidden');
      
      if (isMaintenanceModeActive && !isConsoleOpen) {
        maintenanceScreenOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        if (customMessage && maintSubtitle) {
          maintSubtitle.textContent = customMessage;
        }

        // Force stop speech recognition and active speech synthesis
        if (isRecording && recognition) {
          try { recognition.stop(); } catch (e) {}
        }
        if (synth && synth.speaking) {
          try { synth.cancel(); } catch (e) {}
        }
      } else {
        maintenanceScreenOverlay.classList.add('hidden');
        if (!isConsoleOpen && !isAuthModalOpen) {
          document.body.style.overflow = '';
        }
      }
    }

    if (adminMaintBadge && adminMaintText) {
      adminMaintBadge.classList.toggle('active', isMaintenanceModeActive);
      adminMaintText.textContent = isMaintenanceModeActive ? 'Maintenance Mode ACTIVE' : 'System Online';
    }
  }

  if (maintAdminUnlockBtn) {
    maintAdminUnlockBtn.addEventListener('click', () => {
      openAdminAccess();
    });
  }

  // Periodic polling for maintenance & broadcast status
  async function pollSystemStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        const serverMaint = !!data.maintenance_mode;
        updateMaintenanceScreen(serverMaint, data.maintenance_message);
        if (maintPollingText) {
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          maintPollingText.textContent = `Active (Checked ${now})`;
        }
      }
      loadPublicBroadcast();
    } catch (e) {
      console.warn('System status poll check:', e);
    }
  }

  // Check on page load and periodically
  pollSystemStatus();
  setInterval(pollSystemStatus, 5000);

  // Initial load of public announcement banner
  loadPublicBroadcast();
});


