// ─────────────────────────────────────────────────────────────
// 인프라 서비스 설정 — 정적 메타데이터 + 업그레이드 경로
// 실제 사용량은 BFF(/api/settings/infra-status)에서 env var로 주입
// ─────────────────────────────────────────────────────────────

export type ServiceStatus = 'stable' | 'good' | 'caution' | 'warning' | 'critical';
export type ServiceCategory = 'hosting' | 'database' | 'ai' | 'email' | 'monitoring' | 'storage' | 'backend';

export interface UsageMetric {
  label: string;
  current: number;
  limit: number;
  unit: string;
  usagePercent: number;
}

export interface UpgradePath {
  nextPlan: string;
  nextPlanCostUsd: number;
  keyBenefit: string;
  consoleUrl: string;
  triggerCondition: string;
}

export type ConnectionStatus = 'connected' | 'not_configured' | 'error';

export interface ServiceData {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  currentPlan: string;
  monthlyCostUsd: number;
  isVariableCost: boolean;
  costLabel: string;
  status: ServiceStatus;
  connectionStatus: ConnectionStatus;
  metrics: UsageMetric[];
  upgrade: UpgradePath;
  logoEmoji: string;
}

export interface InfraStatusResponse {
  services: ServiceData[];
  totalMonthlyCostUsd: number;
  lastUpdated: string;
}

// ─── 상태 단계 정의 ───────────────────────────────────────────
export const STATUS_CONFIG: Record<ServiceStatus, {
  label: string;
  description: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  barClass: string;
  emoji: string;
}> = {
  stable: {
    label: '안정',
    description: '여유롭습니다. 현재 플랜으로 충분합니다.',
    colorClass: 'text-green-700',
    bgClass: 'bg-green-50',
    borderClass: 'border-green-200',
    textClass: 'text-green-700',
    barClass: 'bg-green-500',
    emoji: '🟢',
  },
  good: {
    label: '양호',
    description: '정상 범위입니다. 주시하는 것이 좋습니다.',
    colorClass: 'text-blue-700',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    textClass: 'text-blue-700',
    barClass: 'bg-blue-500',
    emoji: '🔵',
  },
  caution: {
    label: '주의',
    description: '사용량이 늘고 있습니다. 업그레이드를 검토하세요.',
    colorClass: 'text-yellow-700',
    bgClass: 'bg-yellow-50',
    borderClass: 'border-yellow-200',
    textClass: 'text-yellow-700',
    barClass: 'bg-yellow-500',
    emoji: '🟡',
  },
  warning: {
    label: '위험',
    description: '한도에 근접했습니다. 곧 업그레이드가 필요합니다.',
    colorClass: 'text-orange-700',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-700',
    barClass: 'bg-orange-500',
    emoji: '🟠',
  },
  critical: {
    label: '폭발직전',
    description: '한도 초과 임박! 즉시 업그레이드가 필요합니다.',
    colorClass: 'text-red-700',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
    textClass: 'text-red-700',
    barClass: 'bg-red-600',
    emoji: '🔴',
  },
};

/** usagePercent → ServiceStatus 자동 산출 */
export function calcStatus(usagePercent: number): ServiceStatus {
  if (usagePercent <= 50) {return 'stable';}
  if (usagePercent <= 70) {return 'good';}
  if (usagePercent <= 85) {return 'caution';}
  if (usagePercent <= 95) {return 'warning';}
  return 'critical';
}

/** 여러 메트릭 중 가장 높은 상태 반환 */
export function worstStatus(metrics: UsageMetric[]): ServiceStatus {
  if (metrics.length === 0) {return 'stable';}
  const order: ServiceStatus[] = ['stable', 'good', 'caution', 'warning', 'critical'];
  let worst: ServiceStatus = 'stable';
  for (const m of metrics) {
    const s = calcStatus(m.usagePercent);
    if (order.indexOf(s) > order.indexOf(worst)) {worst = s;}
  }
  return worst;
}
