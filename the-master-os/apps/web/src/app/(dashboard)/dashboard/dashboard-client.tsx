'use client';

import { StatCard } from './stat-card';
import { WorkspaceOverviewPanel } from './workspace-overview';
import { AgentSummary } from './agent-summary';
import { RecentPipelines } from './recent-pipelines';
import { ActivityFeed } from './activity-feed';
import { QuickActions } from './quick-actions';
import {
  Building2,
  Bot,
  GitBranch,
  CreditCard,
  Newspaper,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardData, SystemHealth } from './types';
import { GodModeCanvas } from './god-mode-canvas';

// ─── Compact health pills (shown inside hero) ───────────────────────────────

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

function HealthPills({ health }: { health: SystemHealth }) {
  const mcpStatus: HealthStatus =
    health.mcp.total === 0
      ? 'unknown'
      : health.mcp.connected > 0
        ? 'healthy'
        : 'unhealthy';

  const pills: Array<{ label: string; status: HealthStatus }> = [
    { label: 'FastAPI', status: health.fastapi },
    { label: 'Supabase', status: health.supabase },
    {
      label:
        health.mcp.total === 0
          ? 'MCP'
          : `MCP ${health.mcp.connected}/${health.mcp.total}`,
      status: mcpStatus,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pills.map((pill) => (
        <span
          key={pill.label}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
            pill.status === 'healthy'
              ? 'bg-green-400/20 text-green-200'
              : pill.status === 'unhealthy'
                ? 'bg-red-400/20 text-red-200'
                : 'bg-white/10 text-white/40',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              pill.status === 'healthy'
                ? 'bg-green-400'
                : pill.status === 'unhealthy'
                  ? 'bg-red-400 animate-pulse'
                  : 'bg-white/30',
            )}
          />
          {pill.label}
        </span>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface DashboardClientProps {
  data: DashboardData;
}

export function DashboardClient({ data }: DashboardClientProps) {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Hero Banner ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-8 py-7"
        style={{
          background:
            'linear-gradient(135deg, #1e1b4b 0%, #312e81 35%, #4338ca 65%, #6366f1 100%)',
        }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-0 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />
        {/* Subtle dot-grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          {/* Left ── title & health */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-300">
              The Master OS
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">
              God Mode Dashboard
            </h2>
            <p className="mt-1 text-sm text-indigo-300">
              전체 법인 현황을 한 눈에 조감합니다
            </p>
            <p className="mt-0.5 text-xs text-indigo-400/70">{today}</p>

            <div className="mt-4">
              <HealthPills health={data.system_health} />
            </div>
          </div>

          {/* Right ── key numbers */}
          <div className="flex items-center gap-0 divide-x divide-white/20 rounded-xl bg-white/10 px-1 backdrop-blur-sm ring-1 ring-white/10">
            {[
              { val: data.workspaces.total,             label: '법인' },
              { val: data.agents.total,                 label: '에이전트' },
              { val: data.pipelines.today_executions,   label: '오늘 실행' },
            ].map(({ val, label }) => (
              <div key={label} className="flex flex-col items-center px-6 py-3">
                <span className="text-2xl font-bold text-white">{val}</span>
                <span className="text-[11px] text-indigo-300">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          에이전트{' '}
          <span className="font-semibold text-gray-800">{data.agents.active}개</span>{' '}
          운영중 · 미배정{' '}
          <span className="font-semibold text-gray-800">{data.agents.pool}개</span>
        </p>
        <QuickActions />
      </div>

      {/* ── KPI Strip ── 5 StatCards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Building2}
          label="워크스페이스"
          value={data.workspaces.total}
          suffix="개 활성"
          color="brand"
        />
        <StatCard
          icon={Bot}
          label="에이전트"
          value={data.agents.total}
          suffix="개"
          subValue={`배정 ${data.agents.active} / 미배정 ${data.agents.pool}`}
          color="green"
        />
        <StatCard
          icon={CreditCard}
          label="크레딧 잔여"
          value={data.credits.total_balance.toLocaleString()}
          suffix="크레딧"
          subValue={
            data.credits.recent_usage > 0
              ? `최근 소모 ${data.credits.recent_usage.toLocaleString()}`
              : undefined
          }
          color="purple"
        />
        <StatCard
          icon={GitBranch}
          label="오늘 파이프라인"
          value={data.pipelines.today_executions}
          suffix="회 실행"
          subValue={
            data.pipelines.running > 0
              ? `현재 ${data.pipelines.running}개 실행중`
              : undefined
          }
          color="amber"
        />
        <StatCard
          icon={Newspaper}
          label="이번 주 발행"
          value={data.content.published_this_week}
          suffix="건"
          color="red"
        />
      </div>

      {/* ── Workspace Overview ───────────────────────────────────────────── */}
      <WorkspaceOverviewPanel workspaces={data.workspaces.list} />

      {/* ── God Mode Canvas ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
            <h3 className="text-sm font-semibold text-gray-900">
              God Mode — 조직 시각화
            </h3>
          </div>
          <span className="text-xs text-gray-400">마우스 휠로 확대/축소</span>
        </div>
        <div className="h-[400px]">
          <GodModeCanvas
            workspaces={data.workspaces.list}
            agentPool={data.agents.pool}
          />
        </div>
      </div>

      {/* ── Middle Row: Agent Summary + Activity Feed ─────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AgentSummary
          total={data.agents.total}
          pool={data.agents.pool}
          active={data.agents.active}
          paused={data.agents.paused}
          categoryBreakdown={data.agents.category_breakdown}
        />
        <ActivityFeed logs={data.audit_logs} />
      </div>

      {/* ── Recent Pipelines ─────────────────────────────────────────────── */}
      <RecentPipelines executions={data.pipelines.recent} />
    </div>
  );
}
