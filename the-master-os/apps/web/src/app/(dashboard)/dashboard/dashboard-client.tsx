'use client';

import { StatCard } from './stat-card';
import { WorkspaceOverviewPanel } from './workspace-overview';
import { AgentSummary } from './agent-summary';
import { RecentPipelines } from './recent-pipelines';
import { ActivityFeed } from './activity-feed';
import { SystemHealthBar } from './system-health-bar';
import { QuickActions } from './quick-actions';
import {
  Building2,
  Bot,
  GitBranch,
  CreditCard,
  Newspaper,
} from 'lucide-react';
import type { DashboardData } from './types';
import { GodModeCanvas } from './god-mode-canvas';

interface DashboardClientProps {
  data: DashboardData;
}

export function DashboardClient({ data }: DashboardClientProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* System Health Bar */}
      <SystemHealthBar health={data.system_health} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">God Mode Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">
            전체 법인 현황을 한 눈에 조감합니다
          </p>
        </div>
        <QuickActions />
      </div>

      {/* KPI Strip - 5 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

      {/* Workspace Overview Grid */}
      <WorkspaceOverviewPanel workspaces={data.workspaces.list} />

      {/* God Mode Canvas */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            God Mode -- 조직 시각화
          </h3>
          <span className="text-xs text-gray-400">
            마우스 휠로 확대/축소
          </span>
        </div>
        <div className="h-[400px]">
          <GodModeCanvas
            workspaces={data.workspaces.list}
            agentPool={data.agents.pool}
          />
        </div>
      </div>

      {/* Middle Row: Agent Summary + Activity Feed */}
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

      {/* Bottom Row: Recent Pipelines */}
      <RecentPipelines executions={data.pipelines.recent} />
    </div>
  );
}
