import React from 'react';
import { Activity, Cpu, Database, Server, Clock, ShieldCheck, Sparkles } from 'lucide-react';

export default function AdminVitalsTab({ vitals }) {
  return (
    <div>
      <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px' }}>
        System Diagnostics & Host Telemetry
      </h3>

      {/* Host Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>CPU Utilization</span>
            <Cpu size={16} color="#6EE7B7" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#6EE7B7', marginTop: '8px' }}>
            {vitals?.cpu_percent || 0}%
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Host Processing Capacity</span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>RAM Usage</span>
            <Activity size={16} color="#A5B4FC" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#A5B4FC', marginTop: '8px' }}>
            {vitals?.ram_used_percent || 0}%
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            {vitals?.process_memory_mb || 0} MB active memory
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>System Uptime</span>
            <Clock size={16} color="#FCD34D" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#FCD34D', marginTop: '8px' }}>
            {vitals?.uptime_human || '0s'}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Continuous Session Time</span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Total Queries Processed</span>
            <Database size={16} color="#EC4899" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#EC4899', marginTop: '8px' }}>
            {vitals?.total_queries_logged || 0}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Audit Stream Ingested</span>
        </div>
      </div>

      {/* Model & Acceleration Specifications */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Server size={18} color="#818CF8" /> PyTorch Neural Network Specifications
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Vocabulary Features</span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#FFFFFF', marginTop: '4px' }}>
              {vitals?.model?.vocabulary_size || 0} tokens
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Classified Intent Tags</span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#FFFFFF', marginTop: '4px' }}>
              {vitals?.model?.intents_count || 0} intents
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Inference Hardware</span>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#34D399', marginTop: '4px' }}>
              {vitals?.model?.device?.toUpperCase() || 'CPU'}
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Groq LLM Acceleration</span>
            <div style={{
              fontSize: '20px',
              fontWeight: '800',
              color: vitals?.groq?.enabled ? '#34D399' : '#F87171',
              marginTop: '4px'
            }}>
              {vitals?.groq?.enabled ? 'Active' : 'Disabled'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
