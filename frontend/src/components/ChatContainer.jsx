import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Trash2, Copy, Check, Volume2, User, Bot, Sparkles, Loader2 } from 'lucide-react';

const PRESETS = [
  "What can you do?",
  "Who created you?",
  "Tell me an AI joke",
  "Calculate 125 * 84",
  "What technologies power you?"
];

export default function ChatContainer({
  onSendMessage,
  messages,
  onClearChat,
  isRecording,
  onToggleRecording,
  interimTranscript,
  isTyping,
  speakText
}) {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="glass-panel" style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 120px)',
      overflow: 'hidden'
    }}>
      {/* Header with Quick Presets & Clear */}
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        overflowX: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', flex: 1 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase' }}>
            Presets:
          </span>
          {PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(preset)}
              className="btn-ghost"
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                whiteSpace: 'nowrap',
                borderRadius: 'var(--radius-full)'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
        <button
          onClick={onClearChat}
          className="btn-ghost"
          style={{ padding: '6px 10px', fontSize: '12px', color: '#F43F5E' }}
          title="Clear Conversation History"
        >
          <Trash2 size={14} />
          <span>Clear</span>
        </button>
      </div>

      {/* Messages Stream */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto',
            textAlign: 'center',
            maxWidth: '380px',
            color: 'var(--text-dim)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              border: '1px solid var(--border-accent)'
            }}>
              <Sparkles size={32} color="#818CF8" />
            </div>
            <h3 style={{ fontSize: '18px', color: '#F1F5F9', marginBottom: '8px' }}>
              Welcome to VoxAI
            </h3>
            <p style={{ fontSize: '13px', lineHeight: '1.6' }}>
              Speak using your microphone or select a prompt above to experience Deep Learning intent classification and high-speed voice synthesis.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  flexDirection: isUser ? 'row-reverse' : 'row'
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: isUser ? 'rgba(255, 255, 255, 0.08)' : 'var(--gradient-brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {isUser ? <User size={18} color="#CBD5E1" /> : <Bot size={18} color="#FFFFFF" />}
                </div>

                {/* Message Body */}
                <div style={{
                  background: isUser
                    ? 'rgba(99, 102, 241, 0.15)'
                    : (msg.intent === 'moderation_warning' ? 'rgba(245, 158, 11, 0.16)' : 'rgba(30, 41, 59, 0.5)'),
                  border: `1px solid ${
                    isUser
                      ? 'rgba(99, 102, 241, 0.35)'
                      : (msg.intent === 'moderation_warning' ? 'rgba(245, 158, 11, 0.45)' : 'var(--border-glass)')
                  }`,
                  borderRadius: '16px',
                  padding: '12px 16px',
                  boxShadow: msg.intent === 'moderation_warning' ? '0 0 20px rgba(245, 158, 11, 0.2)' : '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '4px',
                    fontSize: '11px',
                    color: 'var(--text-dim)'
                  }}>
                    <span style={{ fontWeight: '600' }}>
                      {isUser ? 'You' : 'VoxAI Assistant'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {msg.timestamp}
                      {!isUser && (
                        <>
                          <button
                            onClick={() => handleCopy(msg.id, msg.text)}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}
                            title="Copy reply"
                          >
                            {copiedId === msg.id ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                          </button>
                          <button
                            onClick={() => speakText(msg.text)}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}
                            title="Speak aloud"
                          >
                            <Volume2 size={13} />
                          </button>
                        </>
                      )}
                    </span>
                  </div>

                  <div style={{ fontSize: '14px', lineHeight: '1.5', color: '#F8FAFC', whiteSpace: 'pre-wrap' }}>
                    {msg.text}
                  </div>

                  {/* Bot Metadata Tags */}
                  {!isUser && msg.intent && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                      marginTop: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                      <span className="badge badge-brand" style={{ fontSize: '10px' }}>
                        {msg.intent}
                      </span>
                      {msg.confidence !== undefined && (
                        <span className="badge" style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#34D399' }}>
                          {msg.confidence}% conf
                        </span>
                      )}
                      {msg.engine && (
                        <span className="badge" style={{ fontSize: '10px', background: 'rgba(148, 163, 184, 0.1)', color: '#94A3B8' }}>
                          {msg.engine}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-muted)' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--gradient-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bot size={18} color="#FFFFFF" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontStyle: 'italic' }}>
              <Loader2 size={16} className="fa-spin" /> Neural network generating vocal response...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Speech Audio Wave Visualizer & Status */}
      {isRecording && (
        <div style={{
          padding: '10px 18px',
          background: 'rgba(244, 63, 94, 0.1)',
          borderTop: '1px solid rgba(244, 63, 94, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          color: '#FDA4AF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="pulse-indicator offline" />
            <span>Listening to voice input... Speak now!</span>
            {interimTranscript && (
              <span style={{ fontStyle: 'italic', color: '#F1F5F9' }}>
                "{interimTranscript}"
              </span>
            )}
          </div>
          <button
            onClick={onToggleRecording}
            className="btn-ghost"
            style={{ color: '#FDA4AF', padding: '4px 10px', fontSize: '12px' }}
          >
            Stop Mic
          </button>
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSubmit} style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(7, 9, 14, 0.8)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        {/* Mic Toggle Button */}
        <button
          type="button"
          onClick={onToggleRecording}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: isRecording ? '#F43F5E' : 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${isRecording ? '#FB7185' : 'var(--border-subtle)'}`,
            color: isRecording ? '#FFFFFF' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isRecording ? '0 0 15px rgba(244, 63, 94, 0.5)' : 'none',
            flexShrink: 0
          }}
          title={isRecording ? 'Stop listening' : 'Start microphone speech input'}
        >
          <Mic size={20} />
        </button>

        {/* Text Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask a question or speak using your microphone..."
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 18px',
            color: '#FFFFFF',
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
        />

        {/* Send Button */}
        <button
          type="submit"
          className="btn-primary"
          style={{ width: '44px', height: '44px', padding: 0, justifyContent: 'center' }}
          title="Send query"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
