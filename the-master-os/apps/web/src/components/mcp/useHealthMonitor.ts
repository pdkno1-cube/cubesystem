'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import type { HealthCheckEntry } from './McpHealthTimeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderHealthState {
  provider: string;
  label: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown' | 'not_connected';
  lastCheckAt: string | null;
  responseTimeMs: number;
  consecutiveFailures: number;
}

interface HealthCheckApiResult {
  healthy: boolean;
  provider: string;
  health_status: string;
  tested_at: string;
  response_time_ms?: number;
  note?: string;
}

interface UseHealthMonitorOptions {
  workspaceId: string;
  providers: Array<{ provider: string; label: string; is_connected: boolean; health_status: string; last_health_check: string | null }>;
  /** Polling interval in ms (default: 60000) */
  intervalMs?: number;
  /** Whether monitoring is enabled (default: true) */
  enabled?: boolean;
  /** Callback when a provider transitions to "down" */
  onProviderDown?: (provider: string, label: string) => void;
}

interface UseHealthMonitorReturn {
  /** Current health state per provider */
  healthStates: Map<string, ProviderHealthState>;
  /** Full history of health checks (newest first) */
  history: HealthCheckEntry[];
  /** Whether a bulk check is in progress */
  isRefreshing: boolean;
  /** Manually trigger a full check */
  refreshAll: () => void;
  /** Timestamp of the last full check */
  lastFullCheckAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 60_000;
const MAX_HISTORY_ENTRIES = 200;

// Above this threshold (ms) we consider it "degraded"
const DEGRADED_THRESHOLD_MS = 3000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHealthMonitor({
  workspaceId,
  providers,
  intervalMs = DEFAULT_INTERVAL_MS,
  enabled = true,
  onProviderDown,
}: UseHealthMonitorOptions): UseHealthMonitorReturn {
  const [healthStates, setHealthStates] = useState<Map<string, ProviderHealthState>>(new Map());
  const [history, setHistory] = useState<HealthCheckEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFullCheckAt, setLastFullCheckAt] = useState<string | null>(null);

  const onProviderDownRef = useRef(onProviderDown);
  onProviderDownRef.current = onProviderDown;

  // Initialize health states from provider data
  useEffect(() => {
    const initial = new Map<string, ProviderHealthState>();
    for (const p of providers) {
      const existing = healthStates.get(p.provider);
      initial.set(p.provider, {
        provider: p.provider,
        label: p.label,
        status: existing?.status ?? (p.is_connected ? (p.health_status as ProviderHealthState['status']) : 'not_connected'),
        lastCheckAt: existing?.lastCheckAt ?? p.last_health_check,
        responseTimeMs: existing?.responseTimeMs ?? 0,
        consecutiveFailures: existing?.consecutiveFailures ?? 0,
      });
    }
    setHealthStates(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  // Check a single provider
  const checkProvider = useCallback(
    async (provider: string, label: string): Promise<ProviderHealthState> => {
      const startTime = performance.now();
      try {
        const res = await fetch(
          `/api/mcp/test/${provider}?workspace_id=${workspaceId}`,
          { method: 'POST' },
        );
        const elapsed = Math.round(performance.now() - startTime);

        if (!res.ok) {
          return {
            provider,
            label,
            status: 'down',
            lastCheckAt: new Date().toISOString(),
            responseTimeMs: elapsed,
            consecutiveFailures: (healthStates.get(provider)?.consecutiveFailures ?? 0) + 1,
          };
        }

        const result = (await res.json()) as { data: HealthCheckApiResult };
        const data = result.data;
        const isHealthy = data.healthy;
        const isDegraded = isHealthy && elapsed > DEGRADED_THRESHOLD_MS;

        return {
          provider,
          label,
          status: isDegraded ? 'degraded' : isHealthy ? 'healthy' : 'down',
          lastCheckAt: data.tested_at ?? new Date().toISOString(),
          responseTimeMs: data.response_time_ms ?? elapsed,
          consecutiveFailures: isHealthy
            ? 0
            : (healthStates.get(provider)?.consecutiveFailures ?? 0) + 1,
        };
      } catch (error) {
        Sentry.captureException(error, {
          tags: { context: 'mcp.health.monitor', provider },
        });
        const elapsed = Math.round(performance.now() - startTime);
        return {
          provider,
          label,
          status: 'down',
          lastCheckAt: new Date().toISOString(),
          responseTimeMs: elapsed,
          consecutiveFailures: (healthStates.get(provider)?.consecutiveFailures ?? 0) + 1,
        };
      }
    },
    [workspaceId, healthStates],
  );

  // Run all checks
  const refreshAll = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    const connectedProviders = providers.filter((p) => p.is_connected);
    if (connectedProviders.length === 0) {
      return;
    }

    setIsRefreshing(true);

    const results = await Promise.allSettled(
      connectedProviders.map((p) => checkProvider(p.provider, p.label)),
    );

    const newStates = new Map(healthStates);
    const newHistoryEntries: HealthCheckEntry[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const state = result.value;
        const prevState = newStates.get(state.provider);

        // Detect transition to "down"
        if (
          state.status === 'down' &&
          prevState?.status !== 'down' &&
          onProviderDownRef.current
        ) {
          onProviderDownRef.current(state.provider, state.label);
        }

        newStates.set(state.provider, state);

        newHistoryEntries.push({
          provider: state.provider,
          label: state.label,
          status: state.status === 'not_connected' ? 'unknown' : state.status,
          checkedAt: state.lastCheckAt ?? new Date().toISOString(),
          responseTimeMs: state.responseTimeMs,
        });
      }
    }

    // Keep not-connected providers in the map
    for (const p of providers) {
      if (!p.is_connected && !newStates.has(p.provider)) {
        newStates.set(p.provider, {
          provider: p.provider,
          label: p.label,
          status: 'not_connected',
          lastCheckAt: null,
          responseTimeMs: 0,
          consecutiveFailures: 0,
        });
      }
    }

    setHealthStates(newStates);
    setHistory((prev) => [...newHistoryEntries, ...prev].slice(0, MAX_HISTORY_ENTRIES));
    setLastFullCheckAt(new Date().toISOString());
    setIsRefreshing(false);
  }, [workspaceId, providers, checkProvider, healthStates]);

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled || !workspaceId) {
      return;
    }

    // Initial check after a short delay to let providers load
    const initialTimeout = setTimeout(() => {
      void refreshAll();
    }, 2000);

    const intervalId = setInterval(() => {
      void refreshAll();
    }, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, workspaceId, intervalMs, providers.length]);

  return {
    healthStates,
    history,
    isRefreshing,
    refreshAll: () => void refreshAll(),
    lastFullCheckAt,
  };
}
