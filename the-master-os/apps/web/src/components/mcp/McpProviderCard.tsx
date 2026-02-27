'use client';

import {
  Mail,
  HardDrive,
  MessageCircle,
  Globe,
  FileScan,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  LinkIcon,
  Unlink,
  FlaskConical,
  AlertTriangle,
  Clock,
  Zap,
  AlertOctagon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import type { ProviderHealthState } from './useHealthMonitor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderStatus {
  provider: string;
  label: string;
  description: string;
  icon: string;
  required_secret: string;
  connection_id: string | null;
  secret_ref: string | null;
  health_status: string;
  last_health_check: string | null;
  test_result: Record<string, unknown> | null;
  is_connected: boolean;
}

interface McpProviderCardProps {
  provider: ProviderStatus;
  onConnect: (provider: ProviderStatus) => void;
  onDisconnect: (provider: ProviderStatus) => void;
  onTest: (provider: ProviderStatus) => void;
  isTesting: boolean;
  /** Live health state from the monitoring hook */
  healthState?: ProviderHealthState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  mail: Mail,
  'hard-drive': HardDrive,
  'message-circle': MessageCircle,
  globe: Globe,
  'file-scan': FileScan,
};

type LiveStatus = 'healthy' | 'degraded' | 'down' | 'unknown' | 'not_connected';

function resolveStatus(
  providerStatus: string,
  healthState?: ProviderHealthState,
): LiveStatus {
  if (healthState) {
    return healthState.status;
  }
  // Fallback to provider's stored status
  switch (providerStatus) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'degraded';
    case 'down':
      return 'down';
    case 'not_connected':
      return 'not_connected';
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Health Status Dot — animated pulsing colored indicator
// ---------------------------------------------------------------------------

function HealthDot({ status }: { status: LiveStatus }) {
  const colorMap: Record<LiveStatus, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    down: 'bg-red-500',
    unknown: 'bg-gray-400',
    not_connected: 'bg-gray-300',
  };

  const pulseMap: Record<LiveStatus, string> = {
    healthy: '',
    degraded: 'animate-pulse',
    down: 'animate-pulse',
    unknown: '',
    not_connected: '',
  };

  return (
    <span className="relative flex h-3 w-3">
      {(status === 'down' || status === 'degraded') && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${colorMap[status]} ${pulseMap[status]}`}
        />
      )}
      <span className={`relative inline-flex h-3 w-3 rounded-full ${colorMap[status]}`} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Health Badge — text label next to dot
// ---------------------------------------------------------------------------

function HealthBadge({ status }: { status: LiveStatus }) {
  switch (status) {
    case 'healthy':
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          정상
        </Badge>
      );
    case 'degraded':
      return (
        <Badge variant="warning" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          지연
        </Badge>
      );
    case 'down':
      return (
        <Badge variant="danger" className="gap-1">
          <XCircle className="h-3 w-3" />
          장애
        </Badge>
      );
    case 'not_connected':
      return (
        <Badge variant="default" className="gap-1">
          <XCircle className="h-3 w-3" />
          미연결
        </Badge>
      );
    default:
      return (
        <Badge variant="warning" className="gap-1">
          <HelpCircle className="h-3 w-3" />
          확인 필요
        </Badge>
      );
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    return '-';
  }
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return '-';
  }
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) {
    return '-';
  }
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
      return `${seconds}초 전`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}분 전`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}시간 전`;
  } catch {
    return '-';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function McpProviderCard({
  provider,
  onConnect,
  onDisconnect,
  onTest,
  isTesting,
  healthState,
}: McpProviderCardProps) {
  const Icon = ICON_MAP[provider.icon] ?? Globe;
  const liveStatus = resolveStatus(provider.health_status, healthState);
  const lastCheckAt = healthState?.lastCheckAt ?? provider.last_health_check;
  const responseTimeMs = healthState?.responseTimeMs ?? 0;
  const consecutiveFailures = healthState?.consecutiveFailures ?? 0;

  const borderClass =
    liveStatus === 'healthy'
      ? 'border-green-200 bg-green-50/30'
      : liveStatus === 'down'
        ? 'border-red-200 bg-red-50/30'
        : liveStatus === 'degraded'
          ? 'border-yellow-200 bg-yellow-50/30'
          : '';

  return (
    <Card className={borderClass}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg ${
                provider.is_connected ? 'bg-green-100' : 'bg-gray-100'
              }`}
            >
              <Icon
                className={`h-5 w-5 ${provider.is_connected ? 'text-green-600' : 'text-gray-500'}`}
              />
              {/* Live health dot overlay */}
              {provider.is_connected && (
                <span className="absolute -right-0.5 -top-0.5">
                  <HealthDot status={liveStatus} />
                </span>
              )}
            </div>
            <div>
              <CardTitle className="text-base">{provider.label}</CardTitle>
            </div>
          </div>
          <HealthBadge status={liveStatus} />
        </div>
        <CardDescription className="mt-2 text-sm">{provider.description}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-start gap-1">
            <span className="font-medium text-gray-600">필요한 키:</span>
            <span>{provider.required_secret}</span>
          </div>

          {provider.is_connected && (
            <>
              {/* Last check time */}
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-gray-400" />
                <span className="font-medium text-gray-600">마지막 체크:</span>
                <span title={formatDate(lastCheckAt)}>
                  {formatRelativeTime(lastCheckAt)}
                </span>
              </div>

              {/* Response time */}
              {responseTimeMs > 0 && (
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-gray-400" />
                  <span className="font-medium text-gray-600">응답 시간:</span>
                  <span
                    className={
                      responseTimeMs > 3000
                        ? 'font-medium text-red-600'
                        : responseTimeMs > 1000
                          ? 'font-medium text-yellow-600'
                          : 'text-green-600'
                    }
                  >
                    {responseTimeMs}ms
                  </span>
                </div>
              )}

              {/* Consecutive failures */}
              {consecutiveFailures > 0 && (
                <div className="flex items-center gap-1">
                  <AlertOctagon className="h-3 w-3 text-red-400" />
                  <span className="font-medium text-red-600">연속 실패:</span>
                  <span className="font-medium text-red-600">{consecutiveFailures}회</span>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        {provider.is_connected ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onTest(provider)}
              disabled={isTesting}
              className="gap-1.5"
            >
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FlaskConical className="h-3.5 w-3.5" />
              )}
              테스트
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDisconnect(provider)}
              className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Unlink className="h-3.5 w-3.5" />
              연결 해제
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => onConnect(provider)}
            className="gap-1.5"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            연결하기
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
