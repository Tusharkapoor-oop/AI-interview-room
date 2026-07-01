import React from 'react';

export default function LuxFooter() {
  return (
    <footer className="lux-footer" role="contentinfo">
      <div className="lux-footer-status">
        <span className="lux-footer-dot" aria-hidden="true" />
        <span>Aegis Shield Compliance Active</span>
      </div>

      <div className="lux-footer-links">
        <a href="#privacy" className="lux-footer-link">Privacy Ledger</a>
        <a href="#terms" className="lux-footer-link">Terms of Sanctum</a>
        <a href="#ethics" className="lux-footer-link">Biometric Ethics</a>
      </div>

      <div style={{ fontSize: '11px', color: 'rgba(247, 245, 242, 0.3)' }}>
        © {new Date().getFullYear()} Aegis Systems Inc. All rights reserved.
      </div>
    </footer>
  );
}
