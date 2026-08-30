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

  // Model Inspector DOM Elements
  const inspectEngine = document.getElementById('inspectEngine');
  const inspectIntent = document.getElementById('inspectIntent');
  const inspectConfidence = document.getElementById('inspectConfidence');
  const inspectBar = document.getElementById('inspectBar');
  const inspectLatency = document.getElementById('inspectLatency');

  // App State Variables
  let isRecording = false;
  let isTtsEnabled = true;
  let isGroqEnabled = false;
  let recognition = null;
  let synth = window.speechSynthesis;
  let voices = [];

  // Update Groq UI Toggle state helper
  function updateGroqUI(isEnabled) {
    isGroqEnabled = isEnabled;
    if (groqToggle) groqToggle.checked = isEnabled;
    const groqBadge = document.getElementById('groqBadge');
    const groqLabelText = document.getElementById('groqLabelText');
    if (groqBadge) {
      groqBadge.textContent = isEnabled ? 'ACTIVE' : 'OFF';
      groqBadge.classList.toggle('active', isEnabled);
    }
    if (groqLabelText) {
      groqLabelText.textContent = isEnabled ? 'Groq Mode: Active' : 'Groq Mode: Inactive';
    }
    if (inspectEngine) {
      inspectEngine.textContent = isEnabled ? 'Groq LLM (Llama 3.3)' : 'PyTorch DNN';
    }
  }

  // Check health endpoint to see if backend has GROQ_API_KEY set
  fetch('/api/health')
    .then(res => res.json())
    .then(data => {
      if (data.groq_key_configured) {
        updateGroqUI(true);
      } else {
        updateGroqUI(false);
      }
    })
    .catch(err => console.warn('Health check fetch error:', err));

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
      speechStateText.textContent = `Speech error: ${event.error}. Try typing or retry mic.`;
      setTimeout(() => {
        speechStatusBar.classList.add('hidden');
      }, 4000);
    };

    recognition.onend = () => {
      stopRecording();
      const text = userInput.value.trim ? userInput.value.trim() : userInput.value;
      if (text.length > 0) {
        processUserQuery(text);
        userInput.value = '';
      }
    };
  } else {
    console.warn('Web Speech Recognition API is not supported in this browser.');
    speechStateText.textContent = 'Speech Recognition API not supported in this browser. Use text input.';
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

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Add User Message to UI
    appendMessage('user', text, timestamp);

    // 2. Show Typing Indicator placeholder
    const typingId = appendTypingIndicator();

    try {
      // 3. Call Backend FastAPI /api/chat endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          use_groq: isGroqEnabled
        })
      });

      removeTypingIndicator(typingId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const botReply = data.response;
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
        speakText(botReply);
      }

    } catch (error) {
      console.error('Chat error:', error);
      removeTypingIndicator(typingId);
      appendMessage('bot', 'Apologies, I encountered an error connecting to the backend server.', timestamp, 'error', 0, 'Error');
    }
  }

  // Append Message to UI Stream
  function appendMessage(sender, text, timestamp, intentTag = '', confidence = 0, engine = '') {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');

    let metaHtml = '';
    let playBtnHtml = '';

    if (sender === 'bot') {
      metaHtml = `
        <div class="meta-tag">
          <span class="tag-pill intent-${intentTag}"><i class="fa-solid fa-tag"></i> ${intentTag}</span>
          <span class="tag-pill conf-pill"><i class="fa-solid fa-bolt"></i> ${confidence}% confidence</span>
          <span class="tag-pill engine-pill"><i class="fa-solid fa-microchip"></i> ${engine}</span>
        </div>
      `;
      playBtnHtml = `<button class="play-speech-btn" title="Speak Response"><i class="fa-solid fa-volume-high"></i></button>`;
    }

    msgDiv.innerHTML = `
      <div class="avatar ${sender === 'user' ? 'user-avatar' : 'bot-avatar'}">
        <i class="fa-solid ${sender === 'user' ? 'fa-user' : 'fa-robot'}"></i>
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="sender-name">${sender === 'user' ? 'You (Voice Input)' : 'VoxAI Assistant'}</span>
          <span class="time-stamp">${timestamp} ${playBtnHtml}</span>
        </div>
        <div class="message-body">${escapeHtml(text)}</div>
        ${metaHtml}
      </div>
    `;

    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Attach click event for speech play button
    const playBtn = msgDiv.querySelector('.play-speech-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => speakText(text));
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

  sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (text) {
      processUserQuery(text);
      userInput.value = '';
    }
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendBtn.click();
    }
  });

  clearChatBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = '';
    updateInspector('idle', 100, 0, 'PyTorch DNN');
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
});
