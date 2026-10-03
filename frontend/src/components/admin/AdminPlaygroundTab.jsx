import React, { useState } from 'react';
import { Play, Sparkles, RefreshCw, Terminal, CheckCircle2 } from 'lucide-react';

export default function AdminPlaygroundTab({ token }) {
  const [testPrompt, setTestPrompt] = useState('hello how are you?');
  const [testThreshold, setTestThreshold] = useState(0.50);
  const [testGroq, setTestGroq] = useState(false);
  const [playgroundResult, setPlaygroundResult] = useState(null);
  const [playgroundLoading, setPlaygroundLoading] = useState(false);

  const [retrainLoading, setRetrainLoading] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState('');

  const handleTestInference = async (e) => {
    e?.preventDefault();
    if (!testPrompt.trim()) return;
    setPlaygroundLoading(true);
    try {
      const res = await fetch('/api/admin/test-inference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          text: testPrompt.trim(),
          threshold: parseFloat(testThreshold),
          use_groq: testGroq
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPlaygroundResult(data);
      }
    } catch (e) {
      console.error('Inference test error:', e);
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const handleTriggerRetrain = async () => {
    setRetrainLoading(true);
    setRetrainMsg('Initiating PyTorch model training...');
    try {
      const res = await fetch('/api/admin/retrain', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setRetrainMsg(data.message || 'Retraining started in background.');
      } else {
        setRetrainMsg(data.detail || 'Retraining failed to start.');
      }
    } catch (e) {
      setRetrainMsg('Error starting retrain job.');
    } finally {
      setRetrainLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>
            Neural Inference Playground & Retraining
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Test arbitrary inputs against model weights, inspect probability distributions, or retrain the PyTorch neural net.
          </p>
        </div>

        <button
          onClick={handleTriggerRetrain}
          disabled={retrainLoading}
          className="btn-primary"
          style={{ fontSize: '12px', padding: '8px 16px' }}
        >
          <RefreshCw size={14} className={retrainLoading ? 'animate-spin' : ''} />
          {retrainLoading ? 'Starting Retrain...' : 'Trigger Background Retrain'}
        </button>
      </div>

      {retrainMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#A5B4FC', fontSize: '12px', marginBottom: '16px' }}>
          {retrainMsg}
        </div>
      )}

      {/* Query Form */}
      <form onSubmit={handleTestInference} className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
            Test Query Text
          </label>
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--border-glass)',
              color: '#FFFFFF',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Confidence Threshold: {Math.round(testThreshold * 100)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="0.99"
              step="0.05"
              value={testThreshold}
              onChange={(e) => setTestThreshold(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={testGroq}
              onChange={(e) => setTestGroq(e.target.checked)}
            />
            <span>Also query Groq LLM vocalizer</span>
          </label>
        </div>

        <button type="submit" disabled={playgroundLoading} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>
          <Play size={14} /> {playgroundLoading ? 'Evaluating Model...' : 'Execute Test Inference'}
        </button>
      </form>

      {/* Results View */}
      {playgroundResult && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px', color: '#F1F5F9' }}>
            Model Evaluation Diagnostics
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Predicted Intent</span>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#818CF8' }}>
                {playgroundResult.intent}
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Confidence</span>
              <div style={{ fontSize: '16px', fontWeight: '700', color: playgroundResult.confidence > 50 ? '#34D399' : '#FBBF24' }}>
                {playgroundResult.confidence}%
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Latency</span>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#38BDF8' }}>
                {playgroundResult.latency_ms} ms
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Active Engine</span>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#F472B6' }}>
                {playgroundResult.engine}
              </div>
            </div>
          </div>

          {/* Top Intents Distribution */}
          {playgroundResult.top_intents && playgroundResult.top_intents.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dim)', display: 'block', marginBottom: '8px' }}>
                Top Ranked Intent Probabilities
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {playgroundResult.top_intents.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '120px', fontSize: '12px', color: '#E2E8F0', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {item.tag}
                    </span>
                    <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${item.confidence}%`, height: '100%', background: 'var(--gradient-brand)', borderRadius: '4px' }} />
                    </div>
                    <span style={{ width: '50px', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'right' }}>
                      {item.confidence}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Vocabulary Tokens */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
              Matched In-Vocabulary Tokens
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(playgroundResult.matched_tokens || []).map((tok, i) => (
                <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)', fontSize: '11px', color: '#A5B4FC' }}>
                  {tok}
                </span>
              ))}
            </div>
          </div>

          {/* Bot Response Text */}
          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '11px', color: '#818CF8', display: 'block', marginBottom: '4px', fontWeight: '700' }}>
              Synthesized Voice / Text Output
            </span>
            <p style={{ margin: 0, fontSize: '13px', color: '#FFFFFF', lineHeight: '1.5' }}>
              {playgroundResult.response}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
