'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useExecutionStore } from '@/stores/execution-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepUpdate {
  type:
    | 'connection_ack'
    | 'step_start'
    | 'step_complete'
    | 'agent_streaming'
    | 'execution_complete'
    | 'execution_error'
    | 'ping'
    | 'pong';
  node_id?: string;
  label?: string;
  duration_ms?: number;
  result_preview?: string;
  chunk?: string;
  status?: string;
  total_cost?: number;
  error?: string;
  execution_id?: string;
  user_id?: string;
  message?: string;
  timestamp?: string;
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

interface UseExecutionWSReturn {
  steps: StepUpdate[];
  connectionStatus: ConnectionStatus;
  error: string | null;
  connect: (executionId: string, token: string) => void;
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_FASTAPI_WS_URL ?? 'ws://localhost:8000';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExecutionWS(): UseExecutionWSReturn {
  const [steps, setSteps] = useState<StepUpdate[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const store = useExecutionStore();

  // Clean up retry timer
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // Close existing connection
  const closeConnection = useCallback(() => {
    clearRetryTimer();
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close(1000, 'Client disconnect');
      }
      wsRef.current = null;
    }
  }, [clearRetryTimer]);

  // Core connection logic (used by both connect and reconnect)
  const createConnection = useCallback(
    (executionId: string, token: string) => {
      closeConnection();

      const url = `${WS_BASE_URL}/ws/execution/${executionId}?token=${encodeURIComponent(token)}`;
      setConnectionStatus(
        retryCountRef.current > 0 ? 'reconnecting' : 'connecting',
      );
      setError(null);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryCountRef.current = 0;
        setConnectionStatus('connected');
        setError(null);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;

        let data: StepUpdate;
        try {
          data = JSON.parse(event.data as string) as StepUpdate;
        } catch {
          return; // Ignore unparseable messages
        }

        // Handle server ping
        if (data.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }

        // Handle pong (no-op, just keep-alive ack)
        if (data.type === 'pong') {
          return;
        }

        // Handle connection_ack
        if (data.type === 'connection_ack') {
          setSteps((prev) => [...prev, data]);
          return;
        }

        // Update execution store based on message type
        switch (data.type) {
          case 'step_start':
            if (data.node_id && data.label) {
              store.updateStep(data.node_id, {
                status: 'running',
                startedAt: data.timestamp,
              });
            }
            break;
          case 'step_complete':
            if (data.node_id) {
              store.updateStep(data.node_id, {
                status: 'completed',
                completedAt: data.timestamp,
                durationMs: data.duration_ms,
                resultPreview: data.result_preview,
              });
            }
            break;
          case 'execution_complete':
            store.completeExecution(
              (data.status as 'completed' | 'failed') ?? 'completed',
              data.total_cost,
            );
            break;
          case 'execution_error':
            store.completeExecution('failed', undefined, data.error);
            break;
        }

        setSteps((prev) => [...prev, data]);
      };

      ws.onclose = (event: CloseEvent) => {
        if (!mountedRef.current) return;

        // Policy violation = auth failure, do not retry
        if (event.code === 1008) {
          setConnectionStatus('failed');
          setError('Authentication failed. Please check your credentials.');
          return;
        }

        // Normal close (1000) or client-initiated: do not retry
        if (event.code === 1000) {
          setConnectionStatus('idle');
          return;
        }

        // Unexpected close: attempt reconnect with exponential backoff
        if (retryCountRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, retryCountRef.current);
          retryCountRef.current += 1;
          setConnectionStatus('reconnecting');

          retryTimerRef.current = setTimeout(() => {
            if (mountedRef.current && executionIdRef.current && tokenRef.current) {
              createConnection(executionIdRef.current, tokenRef.current);
            }
          }, delay);
        } else {
          setConnectionStatus('failed');
          setError(
            `Connection lost after ${MAX_RETRIES} reconnection attempts.`,
          );
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        // onclose will fire after onerror, reconnect logic lives there
      };
    },
    [closeConnection, store],
  );

  // Public connect
  const connect = useCallback(
    (executionId: string, token: string) => {
      executionIdRef.current = executionId;
      tokenRef.current = token;
      retryCountRef.current = 0;
      setSteps([]);
      setError(null);
      createConnection(executionId, token);
    },
    [createConnection],
  );

  // Public disconnect
  const disconnect = useCallback(() => {
    executionIdRef.current = null;
    tokenRef.current = null;
    retryCountRef.current = 0;
    closeConnection();
    setConnectionStatus('idle');
  }, [closeConnection]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeConnection();
    };
  }, [closeConnection]);

  return {
    steps,
    connectionStatus,
    error,
    connect,
    disconnect,
  };
}
