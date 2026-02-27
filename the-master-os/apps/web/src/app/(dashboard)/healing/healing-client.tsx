'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  HeartPulse,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Activity,
  Loader2,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorRetry } from '@/components/ui/error-retry';
import { IncidentDetailPanel } from './incident-detail-panel';

// ---------------------------------------------------------------------------
// Types (exported for page.tsx server component)
// ---------------------------------------------------------------------------

export interface HealingIncident {
  id: string;
  workspace_id: string;
  pipeline_execution_id: string | null;
  incident_type: string;
  source_service: string;
  severity: string;
  status: string;
  resolution_action: string | null;
  resolution_details: Record<string, unknown>;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
}

export interface HealingStats {
  total_incidents: number;
  auto_resolved: number;
  auto_resolve_rate: number;
  avg_recovery_seconds: number;
  active_incidents: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
}

interface HealingClientProps {
  initialIncidents: HealingIncident[];
  initialStats: HealingStats;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SeverityKey = 'all' | 'low' | 'medium' | 'high' | 'critical';
type StatusKey = 'all' | 'detected' | 'diagnosing' | 'healing' | 'resolved' | 'escalated';

const SEVERITY_FILTERS: { key: SeverityKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
];

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'detected', label: '감지됨' },
  { key: 'diagnosing', label: '진단중' },
  { key: 'healing', label: '치유중' },
  { key: 'resolved', label: '해결됨' },
  { key: 'escalated', label: '에스컬레이션' },
];

const DEFAULT_SEV_BADGE = { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' } as const;

const SEVERITY_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  low: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  medium: DEFAULT_SEV_BADGE,
  high: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const DEFAULT_HEAL_STATUS = { bg: 'bg-yellow-50', text: 'text-yellow-700' } as const;

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  detected: DEFAULT_HEAL_STATUS,
  diagnosing: { bg: 'bg-blue-50', text: 'text-blue-700' },
  healing: { bg: 'bg-violet-50', text: 'text-violet-700' },
  resolved: { bg: 'bg-green-50', text: 'text-green-700' },
  escalated: { bg: 'bg-red-50', text: 'text-red-700' },
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  api_failure: 'API 장애',
  crawl_blocked: '크롤 차단',
  rate_limited: '속도 제한',
  timeout: '타임아웃',
  auth_expired: '인증 만료',
};

const SERVICE_OPTIONS = [
  'resend',
  'google_drive',
  'slack',
  'firecrawl',
  'paddleocr',
  'supabase',
  'fastapi',
] as const;

const INCIDENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'api_failure', label: 'API 장애' },
  { value: 'crawl_blocked', label: '크롤 차단' },
  { value: 'rate_limited', label: '속도 제한' },
  { value: 'timeout', label: '타임아웃' },
  { value: 'auth_expired', label: '인증 만료' },
];

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof HeartPulse;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incident row
// ---------------------------------------------------------------------------

function IncidentRow({
  incident,
  onSelect,
}: {
  incident: HealingIncident;
  onSelect: (incident: HealingIncident) => void;
}) {
  const sevStyle = SEVERITY_BADGE[incident.severity] ?? DEFAULT_SEV_BADGE;
  const statusStyle = STATUS_BADGE[incident.status] ?? DEFAULT_HEAL_STATUS;

  const detectedAt = new Date(incident.detected_at);
  const timeLabel = detectedAt.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <button
      onClick={() => { onSelect(incident); }}
      className="flex w-full items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-left transition-colors hover:border-violet-200 hover:bg-violet-50/30"
    >
      {/* Severity dot */}
      <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', sevStyle.dot)} />

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800">
            {incident.source_service}
          </span>
          <span
            className={clsx('rounded-full px-2 py-0.5 text-[10px] font-medium', sevStyle.bg, sevStyle.text)}
            aria-label={`심각도: ${incident.severity}`}
          >
            {incident.severity.toUpperCase()}
          </span>
          <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-medium', statusStyle.bg, statusStyle.text)}>
            {STATUS_FILTERS.find((s) => s.key === incident.status)?.label ?? incident.status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          {INCIDENT_TYPE_LABELS[incident.incident_type] ?? incident.incident_type}
          {' · '}
          {timeLabel}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Trigger modal
// ---------------------------------------------------------------------------

function TriggerModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    source_service: string;
    incident_type: string;
    severity: string;
    description: string;
  }) => void;
  isLoading: boolean;
}) {
  const [service, setService] = useState<string>(SERVICE_OPTIONS[0] ?? 'resend');
  const [incidentType, setIncidentType] = useState('api_failure');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">수동 치유 트리거</h3>
        <p className="mt-1 text-sm text-gray-500">
          특정 서비스에 대해 치유 파이프라인을 수동으로 실행합니다.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">대상 서비스</label>
            <select
              value={service}
              onChange={(e) => { setService(e.target.value); }}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              {SERVICE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">인시던트 유형</label>
            <select
              value={incidentType}
              onChange={(e) => { setIncidentType(e.target.value); }}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              {INCIDENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">심각도</label>
            <select
              value={severity}
              onChange={(e) => { setSeverity(e.target.value); }}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">설명 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); }}
              rows={2}
              maxLength={500}
              placeholder="장애 상황에 대한 추가 설명..."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={() => {
              onSubmit({ source_service: service, incident_type: incidentType, severity, description });
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            트리거
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HealingClient (main)
// ---------------------------------------------------------------------------

export function HealingClient({
  initialIncidents,
  initialStats,
  workspaceId,
}: HealingClientProps) {
  const [incidents, setIncidents] = useState<HealingIncident[]>(initialIncidents);
  const [stats, setStats] = useState<HealingStats>(initialStats);
  const [selectedIncident, setSelectedIncident] = useState<HealingIncident | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityKey>('all');
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  const [isRefetching, setIsRefetching] = useState(false);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [isTriggerLoading, setIsTriggerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch data on filter change
  const fetchData = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setIsRefetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId, limit: '50' });
      if (severityFilter !== 'all') {
        params.set('severity', severityFilter);
      }
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const resp = await fetch(`/api/healing?${params.toString()}`);
      if (!resp.ok) {
        throw new Error('인시던트 데이터를 불러오는 데 실패했습니다.');
      }
      const body = (await resp.json()) as {
        data: {
          incidents: HealingIncident[];
          total: number;
          stats: HealingStats;
        };
      };
      setIncidents(body.data.incidents);
      setStats(body.data.stats);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'healing.fetchData' } });
      setError('인시던트 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsRefetching(false);
    }
  }, [workspaceId, severityFilter, statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Filter locally for UI responsiveness (already filtered server-side too)
  const filteredIncidents = incidents.filter((inc) => {
    if (severityFilter !== 'all' && inc.severity !== severityFilter) {
      return false;
    }
    if (statusFilter !== 'all' && inc.status !== statusFilter) {
      return false;
    }
    return true;
  });

  // Handle trigger
  const handleTrigger = useCallback(
    async (data: {
      source_service: string;
      incident_type: string;
      severity: string;
      description: string;
    }) => {
      setIsTriggerLoading(true);
      try {
        const resp = await fetch('/api/healing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_id: workspaceId, ...data }),
        });

        if (resp.ok) {
          setTriggerModalOpen(false);
          void fetchData();
        }
      } catch (error) {
        Sentry.captureException(error, { tags: { context: 'healing.trigger' } });
      } finally {
        setIsTriggerLoading(false);
      }
    },
    [workspaceId, fetchData],
  );

  // Format seconds to human-readable
  const formatRecoveryTime = (seconds: number): string => {
    if (seconds === 0) {
      return '-';
    }
    if (seconds < 60) {
      return `${Math.round(seconds)}초`;
    }
    if (seconds < 3600) {
      return `${Math.round(seconds / 60)}분`;
    }
    return `${(seconds / 3600).toFixed(1)}시간`;
  };

  if (error) {
    return <ErrorRetry message={error} onRetry={() => { void fetchData(); }} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">자동치유</h1>
          <p className="text-sm text-gray-500">
            시스템 장애 자동 감지, 진단, 복구 파이프라인을 관리합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRefetching && <Loader2 className="h-4 w-4 animate-spin text-violet-500" />}
          <button
            onClick={() => { setTriggerModalOpen(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            <Zap className="h-4 w-4" />
            수동 트리거
          </button>
        </div>
      </div>

      {/* KPI 4 cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="총 인시던트"
          value={stats.total_incidents}
          icon={AlertTriangle}
          color="bg-amber-500"
        />
        <KpiCard
          label="자동 해결률"
          value={`${Math.round(stats.auto_resolve_rate * 100)}%`}
          icon={ShieldCheck}
          color="bg-green-500"
        />
        <KpiCard
          label="평균 복구시간"
          value={formatRecoveryTime(stats.avg_recovery_seconds)}
          icon={Clock}
          color="bg-blue-500"
        />
        <KpiCard
          label="활성 인시던트"
          value={stats.active_incidents}
          icon={Activity}
          color={stats.active_incidents > 0 ? 'bg-red-500' : 'bg-gray-400'}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Severity filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500">심각도:</span>
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {SEVERITY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setSeverityFilter(f.key); }}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  severityFilter === f.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500">상태:</span>
          <div className="flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setStatusFilter(f.key); }}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  statusFilter === f.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline + Detail panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        {/* Incident timeline */}
        <div className="flex flex-col gap-2">
          {filteredIncidents.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="감지된 인시던트가 없습니다"
              description={
                severityFilter !== 'all' || statusFilter !== 'all'
                  ? '필터 조건에 맞는 인시던트가 없습니다.'
                  : '시스템이 정상 운영 중입니다.'
              }
            />
          ) : (
            filteredIncidents.map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                onSelect={setSelectedIncident}
              />
            ))
          )}
        </div>

        {/* Detail panel */}
        <IncidentDetailPanel
          incident={selectedIncident}
          onClose={() => { setSelectedIncident(null); }}
        />
      </div>

      {/* Trigger modal */}
      <TriggerModal
        isOpen={triggerModalOpen}
        onClose={() => { setTriggerModalOpen(false); }}
        onSubmit={handleTrigger}
        isLoading={isTriggerLoading}
      />
    </div>
  );
}
