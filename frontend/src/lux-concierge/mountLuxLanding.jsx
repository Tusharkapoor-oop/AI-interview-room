/**
 * Standalone Non-Destructive Integration Mount Hook
 * Exposes window.mountLuxLanding(containerId, options)
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import LuxConciergeApp from './LuxConciergeApp';

if (typeof window !== 'undefined') {
  window.mountLuxLanding = function (containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[Lux UI Error] Container element #${containerId} not found.`);
      return null;
    }
    const root = ReactDOM.createRoot(container);
    root.render(
      <LuxConciergeApp 
        onComplete={options.onComplete} 
        initialReducedMotion={options.reducedMotion || false} 
      />
    );
    return () => root.unmount();
  };
}

export default LuxConciergeApp;
