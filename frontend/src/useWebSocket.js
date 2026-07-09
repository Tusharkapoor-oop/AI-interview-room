/**
 * useWebSocket.js — v2.1
 * Resilient WebSocket hook with auto-reconnect, exponential backoff with jitter,
 * bounded event queue, ping/pong keepalive with timeout detection, and auth token refresh.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_QUEUE_SIZE = 500;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;
const PING_INTERVAL = 30000;
const PONG_TIMEOUT = 10000;
const REFRESH_INTERVAL = 5 * 60 * 1000;

function getBackoffDelay(attempt) {
  const exponential = Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, attempt));
  const jitter = exponential * 0.3 * Math.random();
  return Math.round(exponential + jitter);
}

export function useWebSocket(url, onMessage) {
  const wsRef = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);
  const refreshTimer = useRef(null);
  const heartbeatTimer = useRef(null);
  const pongTimeoutTimer = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const onMessageRef = useRef(onMessage);
  const eventQueueRef = useRef([]);

  const drainQueue = useCallback(() => {
    const q = eventQueueRef.current;
    if (q.length === 0) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const batch = q.splice(0, 10);
    for (const data of batch) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  const connectRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
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
        if (data.type === 'pong') return;
        onMessageRef.current?.(data);
        if (pongTimeoutTimer.current) {
          clearTimeout(pongTimeoutTimer.current);
          pongTimeoutTimer.current = null;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    const scheduleReconnect = () => {
      const delay = getBackoffDelay(reconnectAttempt.current);
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(() => connectRef.current?.(), delay);
    };

    ws.onclose = (event) => {
      setStatus('disconnected');
      if (pongTimeoutTimer.current) {
        clearTimeout(pongTimeoutTimer.current);
        pongTimeoutTimer.current = null;
      }
      if (event.code === 4003) return;
      if (reconnectAttempt.current >= MAX_RECONNECT_ATTEMPTS) {
        setStatus('failed');
        return;
      }
      scheduleReconnect();
    };

    ws.onerror = () => ws.close();
  }, [url, drainQueue]);

  useEffect(() => {
    connectRef.current = connect;
  });

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    connectRef.current?.();

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
      } catch {
        // Ignore refresh errors
      }
    }, REFRESH_INTERVAL);

    heartbeatTimer.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
          pongTimeoutTimer.current = setTimeout(() => {
            wsRef.current?.close();
          }, PONG_TIMEOUT);
        } catch {
          wsRef.current?.close();
        }
      }
    }, PING_INTERVAL);

    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(refreshTimer.current);
      clearInterval(heartbeatTimer.current);
      if (pongTimeoutTimer.current) clearTimeout(pongTimeoutTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    } else {
      const q = eventQueueRef.current;
      if (q.length < MAX_QUEUE_SIZE) {
        q.push(data);
      }
    }
  }, []);

  return { send, status };
}
