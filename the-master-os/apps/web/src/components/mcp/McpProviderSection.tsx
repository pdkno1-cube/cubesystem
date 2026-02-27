'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Plug2 } from 'lucide-react';
import { McpProviderCard, type ProviderStatus } from './McpProviderCard';
import { ConnectProviderModal } from './ConnectProviderModal';
import { McpHealthSummary } from './McpHealthSummary';
import { McpHealthTimeline } from './McpHealthTimeline';
import { useHealthMonitor } from './useHealthMonitor';
import { useToast } from '@/hooks/use-toast';

interface VaultSecret {
  id: string;
  name: string;
  slug: string;
  category: string;
}

interface McpProviderSectionProps {
  workspaceId: string;
  vaultSecrets: VaultSecret[];
}

export function McpProviderSection({ workspaceId, vaultSecrets }: McpProviderSectionProps) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectTarget, setConnectTarget] = useState<ProviderStatus | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const { toast } = useToast();

  const fetchProviders = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    try {
      const res = await fetch(`/api/mcp/providers?workspace_id=${workspaceId}`);
      if (!res.ok) {
        return;
      }
      const result = await res.json() as { data: ProviderStatus[] };
      setProviders(result.data ?? []);
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'mcp.providers.fetch' } });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  // ── Health Monitor Hook ──────────────────────────────────────────
  const healthMonitorProviders = providers.map((p) => ({
    provider: p.provider,
    label: p.label,
    is_connected: p.is_connected,
    health_status: p.health_status,
    last_health_check: p.last_health_check,
  }));

  const {
    healthStates,
    history,
    isRefreshing,
    refreshAll,
    lastFullCheckAt,
  } = useHealthMonitor({
    workspaceId,
    providers: healthMonitorProviders,
    intervalMs: 60_000,
    enabled: !isLoading && providers.length > 0,
    onProviderDown: (provider: string, label: string) => {
      toast({
        title: `${label} 연결 장애`,
        description: `${provider} 프로바이더가 응답하지 않습니다. 설정을 확인해주세요.`,
        variant: 'error',
      });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────

  const handleConnect = (provider: ProviderStatus) => {
    setConnectTarget(provider);
  };

  const handleDisconnect = async (provider: ProviderStatus) => {
    if (!provider.connection_id) {
      return;
    }
    try {
      await fetch(
        `/api/mcp/connections?workspace_id=${workspaceId}&connection_id=${provider.connection_id}`,
        { method: 'DELETE' },
      );
      await fetchProviders();
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'mcp.provider.disconnect' } });
    }
  };

  const handleTest = async (provider: ProviderStatus) => {
    setTestingProvider(provider.provider);
    try {
      await fetch(`/api/mcp/test/${provider.provider}?workspace_id=${workspaceId}`, {
        method: 'POST',
      });
      await fetchProviders();
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'mcp.provider.test' } });
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Plug2 className="h-5 w-5 text-gray-500" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">MCP 프로바이더 연동</h3>
          <p className="text-sm text-gray-500">
            볼트에 저장한 API 키를 각 프로바이더에 연결하세요.
          </p>
        </div>
      </div>

      {/* Health Summary Card */}
      {!isLoading && providers.length > 0 && (
        <McpHealthSummary
          healthStates={healthStates}
          isRefreshing={isRefreshing}
          onRefreshAll={refreshAll}
          lastFullCheckAt={lastFullCheckAt}
        />
      )}

      {/* Provider grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="h-48 animate-pulse rounded-lg border bg-gray-100"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <McpProviderCard
              key={p.provider}
              provider={p}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onTest={handleTest}
              isTesting={testingProvider === p.provider}
              healthState={healthStates.get(p.provider)}
            />
          ))}
        </div>
      )}

      {/* Health Timeline */}
      {!isLoading && history.length > 0 && (
        <McpHealthTimeline history={history} />
      )}

      {/* Connect modal */}
      <ConnectProviderModal
        open={connectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConnectTarget(null);
          }
        }}
        provider={connectTarget}
        workspaceId={workspaceId}
        vaultSecrets={vaultSecrets}
        onConnected={async () => {
          setConnectTarget(null);
          await fetchProviders();
        }}
      />
    </section>
  );
}
