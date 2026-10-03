import React from 'react';
import { Cpu, Zap, Activity, Clock, Tag } from 'lucide-react';

export default function ModelInspector({ telemetry }) {
  const { engine = 'PyTorch DNN', intent = 'idle', confidence = 100, latency = 0 } = telemetry || {};

  return (
    <div className="glass-panel" style={{
      padding: '20px',
      height: 'fit-content',
      position: 'sticky',
      top: '90px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={17} color="#818CF8" /> Real-Time Telemetry
        </h3>
        <span className="badge badge-brand">{engine}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Intent Prediction */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Tag size={13} /> Predicted Intent
            </span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>
            {intent}
          </div>
        </div>

        {/* Confidence Progress Bar */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Zap size={13} /> Model Confidence
            </span>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#34D399', fontFamily: 'var(--font-mono)' }}>
              {confidence}%
            </span>
          </div>
          <div style={{
            height: '6px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${confidence}%`,
              background: confidence > 70 ? 'var(--gradient-brand)' : '#F59E0B',
              transition: 'width 0.4s ease-out',
              borderRadius: '4px'
            }} />
          </div>
        </div>

        {/* Latency Metric */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={13} /> Inference Latency
            </span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#A5B4FC', fontFamily: 'var(--font-mono)' }}>
              {latency} ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
