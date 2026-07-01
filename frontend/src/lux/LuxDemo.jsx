import React, { useState } from 'react';
import LuxLanding from './LuxLanding';

export default function LuxDemo() {
  const [luxEnabled, setLuxEnabled] = useState(true);
  const [sessionUnlocked, setSessionUnlocked] = useState(false);
  const [logs, setLogs] = useState([]);

  const logEvent = (msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 8)]);
  };

  const handleComplete = (data) => {
    logEvent(` Concierge onboarding completed! Access code or email verified.`);
    setSessionUnlocked(true);
  };

  return (
    <div style={{ background: '#070708', minHeight: '100vh', color: '#F7F5F2', padding: '16px' }}>
      
      {/* Control Panel (Isolated) */}
      <div 
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: 'rgba(18, 18, 20, 0.95)',
          border: '1px solid rgba(201, 167, 107, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          zIndex: 9999,
          maxWidth: '300px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.8)',
          fontFamily: 'sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <strong style={{ fontSize: '13px', color: '#C9A76B', letterSpacing: '1px' }}>LUX STAGING CONTROL</strong>
          <span 
            style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: luxEnabled ? '#E5C158' : '#777', 
              boxShadow: luxEnabled ? '0 0 8px #C9A76B' : 'none' 
            }} 
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={luxEnabled} 
              onChange={(e) => {
                setLuxEnabled(e.target.checked);
                logEvent(`Feature flag changed: luxEnabled = ${e.target.checked}`);
              }} 
            />
            <span>Enable Lux Landing Page</span>
          </label>

          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
            <span style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>SESSION LOCK STATE</span>
            <span style={{ color: sessionUnlocked ? '#C9A76B' : '#ff4a4a', fontWeight: 'bold' }}>
              {sessionUnlocked ? "✓ UNLOCKED" : "🔒 LOCKED"}
            </span>
          </div>

          {sessionUnlocked && (
            <button
              onClick={() => {
                setSessionUnlocked(false);
                logEvent("Session locked. Re-entering admissions queue.");
              }}
              style={{
                background: 'rgba(255,74,74,0.1)',
                border: '1px solid rgba(255,74,74,0.3)',
                color: '#ff4a4a',
                padding: '6px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold'
              }}
            >
              Re-Lock Session
            </button>
          )}

          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
            <span style={{ fontSize: '10px', color: '#777', display: 'block' }}>REAL-TIME STAGING LOGS</span>
            <div style={{ maxHeight: '80px', overflowY: 'auto', background: '#000', borderRadius: '4px', padding: '6px', fontSize: '9px', fontFamily: 'monospace', color: '#C9A76B', marginTop: '4px' }}>
              {logs.length === 0 ? "No active logs." : logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Flag Conditional Mount */}
      {luxEnabled ? (
        <LuxLanding 
          onComplete={handleComplete} 
          initialReducedMotion={false}
        />
      ) : (
        <div style={{ padding: '64px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ fontFamily: 'serif', fontSize: '32px', color: '#C9A76B' }}>Aegis Default Experience</h2>
          <p style={{ color: '#999', marginTop: '12px' }}>
            The luxury landing page is currently disabled behind the feature flag.
          </p>
          <div style={{ display: 'inline-block', border: '1px dashed #555', borderRadius: '8px', padding: '24px', marginTop: '24px', background: '#111' }}>
            <span style={{ fontSize: '13px', display: 'block', color: '#ff7b72', fontFamily: 'monospace', marginBottom: '8px' }}>const flagEnabled = false;</span>
            <span style={{ fontSize: '12px', color: '#888' }}>Use the control panel in the bottom-right to toggle the feature flag.</span>
          </div>
        </div>
      )}

    </div>
  );
}
