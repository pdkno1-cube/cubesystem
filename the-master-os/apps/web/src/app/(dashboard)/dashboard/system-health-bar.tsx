'use client';

import { Server, Plug, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemHealth } from './types';

interface SystemHealthBarProps {
  health: SystemHealth;
}

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

function StatusIndicator({ status, label }: { status: HealthStatus; label: string }) {
  const config: Record<HealthStatus, { icon: typeof CheckCircle2; color: string; dotColor: string; text: string }> = {
    healthy: {
      icon: CheckCircle2,
      color: 'text-green-600',
      dotColor: 'bg-green-400',
      text: '정상',
    },
    unhealthy: {
      icon: XCircle,
      color: 'text-red-600',
      dotColor: 'bg-red-400',
      text: '오류',
    },
    unknown: {
      icon: HelpCircle,
      color: 'text-gray-400',
      dotColor: 'bg-gray-300',
      text: '미확인',
    },
  };

  const cfg = config[status];
  const Icon = cfg.icon;

  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2 w-2 rounded-full', cfg.dotColor)} />
      <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <span className={cn('text-xs', cfg.color)}>{cfg.text}</span>
    </div>
  );
}

export function SystemHealthBar({ health }: SystemHealthBarProps) {
  const mcpStatus: HealthStatus =
    health.mcp.total === 0
      ? 'unknown'
      : health.mcp.connected === health.mcp.total
        ? 'healthy'
        : health.mcp.connected > 0
          ? 'healthy'
          : 'unhealthy';

  const mcpLabel =
    health.mcp.total === 0
      ? 'MCP (미설정)'
      : `MCP (${health.mcp.connected}/${health.mcp.total})`;

  return (
    <div className="flex items-center gap-6 rounded-lg border border-gray-200 bg-white px-5 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <Server className="h-3.5 w-3.5" />
        시스템 상태
      </div>

      <div className="h-4 w-px bg-gray-200" />

      <StatusIndicator status={health.fastapi} label="FastAPI" />

      <div className="h-4 w-px bg-gray-200" />

      <StatusIndicator status={health.supabase} label="Supabase" />

      <div className="h-4 w-px bg-gray-200" />

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            mcpStatus === 'healthy'
              ? 'bg-green-400'
              : mcpStatus === 'unhealthy'
                ? 'bg-red-400'
                : 'bg-gray-300',
          )}
        />
        <Plug
          className={cn(
            'h-3.5 w-3.5',
            mcpStatus === 'healthy'
              ? 'text-green-600'
              : mcpStatus === 'unhealthy'
                ? 'text-red-600'
                : 'text-gray-400',
          )}
        />
        <span className="text-xs font-medium text-gray-700">{mcpLabel}</span>
        <span
          className={cn(
            'text-xs',
            mcpStatus === 'healthy'
              ? 'text-green-600'
              : mcpStatus === 'unhealthy'
                ? 'text-red-600'
                : 'text-gray-400',
          )}
        >
          {mcpStatus === 'healthy' ? '정상' : mcpStatus === 'unhealthy' ? '오류' : '미확인'}
        </span>
      </div>
    </div>
  );
}
