'use client';

import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProviderHealthState } from './useHealthMonitor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpHealthSummaryProps {
  healthStates: Map<string, ProviderHealthState>;
  isRefreshing: boolean;
  onRefreshAll: () => void;
  lastFullCheckAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(dateStr: string | null): string {
  if (!dateStr) {
    return '-';
  }
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return '-';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function McpHealthSummary({
  healthStates,
  isRefreshing,
  onRefreshAll,
  lastFullCheckAt,
}: McpHealthSummaryProps) {
  const totalProviders = healthStates.size;

  let healthyCount = 0;
  let degradedCount = 0;
  let downCount = 0;
  let notConnectedCount = 0;

  for (const state of healthStates.values()) {
    switch (state.status) {
      case 'healthy':
        healthyCount++;
        break;
      case 'degraded':
        degradedCount++;
        break;
      case 'down':
        downCount++;
        break;
      case 'not_connected':
        notConnectedCount++;
        break;
      default:
        break;
    }
  }

  const connectedCount = totalProviders - notConnectedCount;
  const uptimePercent =
    connectedCount > 0
      ? Math.round((healthyCount / connectedCount) * 100)
      : 0;

  return (
    <Card className="border-blue-100 bg-blue-50/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-base">MCP 헬스 모니터</CardTitle>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            전체 체크
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Total providers */}
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{totalProviders}</p>
            <p className="text-xs text-gray-500">전체 프로바이더</p>
          </div>

          {/* Healthy */}
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <p className="text-2xl font-bold text-green-600">{healthyCount}</p>
            </div>
            <p className="text-xs text-gray-500">정상</p>
          </div>

          {/* Unhealthy (degraded + down) */}
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-1">
              {downCount > 0 ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : degradedCount > 0 ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-gray-300" />
              )}
              <p
                className={`text-2xl font-bold ${
                  downCount > 0
                    ? 'text-red-600'
                    : degradedCount > 0
                      ? 'text-yellow-600'
                      : 'text-gray-400'
                }`}
              >
                {degradedCount + downCount}
              </p>
            </div>
            <p className="text-xs text-gray-500">비정상</p>
          </div>

          {/* Uptime */}
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <Badge
              variant={uptimePercent >= 95 ? 'success' : uptimePercent >= 70 ? 'warning' : 'danger'}
              className="mb-1 text-base font-bold"
            >
              {connectedCount > 0 ? `${uptimePercent}%` : 'N/A'}
            </Badge>
            <p className="text-xs text-gray-500">업타임</p>
          </div>
        </div>

        {/* Last check timestamp */}
        <p className="mt-3 text-center text-[10px] text-gray-400">
          마지막 전체 체크: {formatTime(lastFullCheckAt)}
          {' · '}60초 주기 자동 체크
        </p>
      </CardContent>
    </Card>
  );
}
