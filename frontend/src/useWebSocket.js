/**
 * useWebSocket.js — v2.0
 * Resilient WebSocket hook with auto-reconnect, exponential backoff,
 * event queue for missed messages during reconnection, and auth token refresh.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useWebSocket(url, onMessage) {
  const wsRef = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);
  const refreshTimer = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const onMessageRef = useRef(onMessage);
  const eventQueueRef = useRef([]);

  const drainQueue = useCallback(() => {
    const q = eventQueueRef.current;
    if (q.length === 0) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (q.length > 0) {
      const data = q.shift();
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    // Pass JWT token via Sec-WebSocket-Protocol header (Bearer <token>)
    const token = localStorage.getItem('access_token');
    const protocols = token ? [`Bearer ${token}`] : [];
    const ws = new WebSocket(url, protocols);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttempt.current = 0;
      drainQueue();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch {}
    };

    ws.onclose = (event) => {
      setStatus('disconnected');
      if (event.code === 4003) return;
      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, [url, drainQueue]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    connect();

    const REFRESH_INTERVAL = 5 * 60 * 1000;
    refreshTimer.current = setInterval(async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
        });
        if (res.ok) {
          const { access_token } = await res.json();
          localStorage.setItem('access_token', access_token);
        }
      } catch {}
    }, REFRESH_INTERVAL);

    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(refreshTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    } else {
      eventQueueRef.current.push(data);
    }
  }, []);

  return { send, status };
}
