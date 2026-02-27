'use client';

import { useMemo } from 'react';
import { Clock, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthCheckEntry {
  provider: string;
  label: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  checkedAt: string;
  responseTimeMs: number;
}

interface McpHealthTimelineProps {
  /** Ordered list of health check entries (newest first) */
  history: HealthCheckEntry[];
  /** Provider filter — show all if undefined */
  providerFilter?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: HealthCheckEntry['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'down':
      return 'bg-red-500';
    case 'unknown':
      return 'bg-gray-400';
  }
}

function statusLabel(status: HealthCheckEntry['status']): string {
  switch (status) {
    case 'healthy':
      return '정상';
    case 'degraded':
      return '지연';
    case 'down':
      return '장애';
    case 'unknown':
      return '미확인';
  }
}

function formatTime(dateStr: string): string {
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

function computeUptimePercent(entries: HealthCheckEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }
  const healthyCount = entries.filter((e) => e.status === 'healthy').length;
  return Math.round((healthyCount / entries.length) * 100);
}

// ---------------------------------------------------------------------------
// Mini Bar Chart — last 24 checks as colored blocks
// ---------------------------------------------------------------------------

function MiniHealthBar({ entries }: { entries: HealthCheckEntry[] }) {
  // Show up to 24 blocks
  const displayEntries = entries.slice(0, 24);

  if (displayEntries.length === 0) {
    return (
      <p className="text-xs text-gray-400">체크 이력 없음</p>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Reverse so oldest is on the left */}
      {[...displayEntries].reverse().map((entry, idx) => (
        <div
          key={`bar-${entry.provider}-${idx}`}
          className={`h-5 w-1.5 rounded-sm ${statusColor(entry.status)}`}
          title={`${formatTime(entry.checkedAt)} — ${statusLabel(entry.status)} (${entry.responseTimeMs}ms)`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function McpHealthTimeline({ history, providerFilter }: McpHealthTimelineProps) {
  const filteredHistory = useMemo(() => {
    if (!providerFilter) {
      return history;
    }
    return history.filter((h) => h.provider === providerFilter);
  }, [history, providerFilter]);

  // Group by provider
  const groupedByProvider = useMemo(() => {
    const map = new Map<string, { label: string; entries: HealthCheckEntry[] }>();
    for (const entry of filteredHistory) {
      const existing = map.get(entry.provider);
      if (existing) {
        existing.entries.push(entry);
      } else {
        map.set(entry.provider, { label: entry.label, entries: [entry] });
      }
    }
    return map;
  }, [filteredHistory]);

  const totalUptime = computeUptimePercent(filteredHistory);

  if (filteredHistory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            <CardTitle className="text-base">헬스 체크 타임라인</CardTitle>
          </div>
          <CardDescription>자동 헬스 체크가 시작되면 이력이 표시됩니다.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            <div>
              <CardTitle className="text-base">헬스 체크 타임라인</CardTitle>
              <CardDescription>최근 24시간 헬스 체크 이력</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalUptime >= 95 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : totalUptime >= 70 ? (
              <TrendingUp className="h-4 w-4 text-yellow-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            )}
            <Badge
              variant={totalUptime >= 95 ? 'success' : totalUptime >= 70 ? 'warning' : 'danger'}
            >
              전체 업타임 {totalUptime}%
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {Array.from(groupedByProvider.entries()).map(([provider, { label, entries }]) => {
          const uptime = computeUptimePercent(entries);
          const latestEntry = entries[0];
          const latestMs = latestEntry?.responseTimeMs ?? 0;

          return (
            <div key={provider} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <Badge
                    variant={uptime >= 95 ? 'success' : uptime >= 70 ? 'warning' : 'danger'}
                    className="text-[10px]"
                  >
                    {uptime}%
                  </Badge>
                </div>
                <span className="text-xs text-gray-400">
                  {latestMs > 0 ? `${latestMs}ms` : '-'}
                </span>
              </div>
              <MiniHealthBar entries={entries} />
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex items-center gap-4 border-t border-gray-100 pt-3 text-[10px] text-gray-400">
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-green-500" />
            정상
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-yellow-500" />
            지연
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-red-500" />
            장애
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-sm bg-gray-400" />
            미확인
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
