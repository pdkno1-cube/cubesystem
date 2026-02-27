'use client';

import { X, Clock, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { HealingIncident } from './healing-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SEV_COLORS = { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' } as const;

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  medium: DEFAULT_SEV_COLORS,
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

const DEFAULT_STATUS_INFO = { label: '감지됨', icon: AlertTriangle, color: 'text-yellow-600' } as const;

const STATUS_INFO: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  detected: DEFAULT_STATUS_INFO,
  diagnosing: { label: '진단중', icon: Clock, color: 'text-blue-600' },
  healing: { label: '치유중', icon: ArrowRight, color: 'text-violet-600' },
  resolved: { label: '해결됨', icon: CheckCircle2, color: 'text-green-600' },
  escalated: { label: '에스컬레이션', icon: AlertTriangle, color: 'text-red-600' },
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  api_failure: 'API 장애',
  crawl_blocked: '크롤 차단',
  rate_limited: '속도 제한',
  timeout: '타임아웃',
  auth_expired: '인증 만료',
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function computeDuration(detectedAt: string, resolvedAt: string | null): string {
  if (!resolvedAt) {
    const elapsed = (Date.now() - new Date(detectedAt).getTime()) / 1000;
    if (elapsed < 60) {
      return `${Math.round(elapsed)}초 (진행중)`;
    }
    if (elapsed < 3600) {
      return `${Math.round(elapsed / 60)}분 (진행중)`;
    }
    return `${(elapsed / 3600).toFixed(1)}시간 (진행중)`;
  }
  const delta = (new Date(resolvedAt).getTime() - new Date(detectedAt).getTime()) / 1000;
  if (delta < 60) {
    return `${Math.round(delta)}초`;
  }
  if (delta < 3600) {
    return `${Math.round(delta / 60)}분`;
  }
  return `${(delta / 3600).toFixed(1)}시간`;
}

// ---------------------------------------------------------------------------
// Detail row
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="text-xs text-gray-800">{value ?? '-'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IncidentDetailPanel({
  incident,
  onClose,
}: {
  incident: HealingIncident | null;
  onClose: () => void;
}) {
  if (!incident) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm text-gray-400">
          인시던트를 선택하면 상세 정보를 확인할 수 있습니다
        </p>
      </div>
    );
  }

  const sevColors = SEVERITY_COLORS[incident.severity] ?? DEFAULT_SEV_COLORS;
  const statusInfo = STATUS_INFO[incident.status] ?? DEFAULT_STATUS_INFO;
  const StatusIcon = statusInfo.icon;

  const details = incident.resolution_details ?? {};
  const detailKeys = Object.keys(details);

  return (
    <div className={clsx('rounded-xl border bg-white', sevColors.border)}>
      {/* Header */}
      <div className={clsx('flex items-center justify-between rounded-t-xl px-4 py-3', sevColors.bg)}>
        <div className="flex items-center gap-2">
          <StatusIcon className={clsx('h-4 w-4', statusInfo.color)} />
          <span className={clsx('text-sm font-semibold', sevColors.text)}>
            {statusInfo.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-white/50 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="space-y-4 p-4">
        {/* Service & type */}
        <div>
          <h4 className="text-base font-semibold text-gray-900">{incident.source_service}</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            {INCIDENT_TYPE_LABELS[incident.incident_type] ?? incident.incident_type}
          </p>
        </div>

        {/* Timeline */}
        <div className="space-y-2 rounded-lg bg-gray-50 p-3">
          <DetailRow label="감지 시각" value={formatDateTime(incident.detected_at)} />
          <DetailRow
            label="해결 시각"
            value={incident.resolved_at ? formatDateTime(incident.resolved_at) : null}
          />
          <DetailRow
            label="소요 시간"
            value={computeDuration(incident.detected_at, incident.resolved_at)}
          />
          <DetailRow label="심각도" value={incident.severity.toUpperCase()} />
        </div>

        {/* Resolution action */}
        {incident.resolution_action && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-xs font-medium text-green-700">적용된 조치</p>
            <p className="mt-1 text-sm text-green-800">{incident.resolution_action}</p>
          </div>
        )}

        {/* Resolution details */}
        {detailKeys.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">상세 정보</p>
            <div className="max-h-48 overflow-y-auto rounded-lg bg-gray-50 p-3">
              <pre className="whitespace-pre-wrap text-xs text-gray-700">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Pipeline execution link */}
        {incident.pipeline_execution_id && (
          <DetailRow
            label="파이프라인 ID"
            value={incident.pipeline_execution_id}
          />
        )}

        {/* Incident ID */}
        <div className="border-t border-gray-100 pt-2">
          <p className="text-[10px] text-gray-400">ID: {incident.id}</p>
        </div>
      </div>
    </div>
  );
}
