/**
 * AegisToast.jsx
 * Ephemeral security alert toast — candidates see this, auto-dismissed.
 * WCAG 2.1 AA compliant with role="alert".
 */
import React, { useEffect } from 'react';
import { useAegisStore } from './useAegisStore';

export default function AegisToast() {
  const { toast, clearToast } = useAegisStore();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, toast.duration || 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className={`aegis-toast ${toast.type}`}
      role="alert"
      aria-live="assertive"
    >
      <span aria-hidden="true">
        {toast.type === 'error' ? '🚨' : toast.type === 'warn' ? '⚠️' : 'ℹ️'}
      </span>
      <span>{toast.msg}</span>
      <div
        className="toast-drain"
        style={{ animationDuration: `${toast.duration || 6000}ms` }}
        onAnimationEnd={clearToast}
      />
    </div>
  );
}
