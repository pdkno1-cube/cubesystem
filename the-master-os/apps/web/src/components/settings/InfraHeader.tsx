import { DollarSign, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { InfraStatusResponse, ServiceStatus } from './infra-service-config';

interface InfraHeaderProps {
  data: InfraStatusResponse;
  onRefresh: () => void;
  isLoading: boolean;
}

function overallStatus(data: InfraStatusResponse): ServiceStatus {
  const order: ServiceStatus[] = ['critical', 'warning', 'caution', 'good', 'stable'];
  for (const s of order) {
    if (data.services.some((svc) => svc.status === s)) {return s;}
  }
  return 'stable';
}

const OVERALL_LABELS: Record<ServiceStatus, { text: string; icon: React.ReactNode; cls: string }> = {
  stable:   { text: '전체 인프라 안정',     icon: <CheckCircle2 className="h-4 w-4" />, cls: 'text-green-700 bg-green-50 border-green-200' },
  good:     { text: '전체 인프라 양호',     icon: <CheckCircle2 className="h-4 w-4" />, cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  caution:  { text: '일부 서비스 주의 필요', icon: <AlertTriangle className="h-4 w-4" />, cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  warning:  { text: '업그레이드 검토 필요', icon: <AlertTriangle className="h-4 w-4" />, cls: 'text-orange-700 bg-orange-50 border-orange-200' },
  critical: { text: '즉시 조치 필요!',      icon: <AlertTriangle className="h-4 w-4" />, cls: 'text-red-700 bg-red-50 border-red-200' },
};

export function InfraHeader({ data, onRefresh, isLoading }: InfraHeaderProps) {
  const status = overallStatus(data);
  const label = OVERALL_LABELS[status];
  const countByStatus = {
    critical: data.services.filter((s) => s.status === 'critical').length,
    warning:  data.services.filter((s) => s.status === 'warning').length,
    caution:  data.services.filter((s) => s.status === 'caution').length,
    good:     data.services.filter((s) => s.status === 'good').length,
    stable:   data.services.filter((s) => s.status === 'stable').length,
  };

  const updatedAt = new Date(data.lastUpdated).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 shadow-sm">
      {/* 타이틀 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">인프라 비용 & 서비스 현황</h3>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed max-w-2xl">
            The Master OS를 운영하는 모든 외부 서비스의 <strong>요금제·사용량·예상 비용</strong>을 한눈에 확인합니다.
            각 서비스 카드의 상태 배지를 보고 업그레이드 시점을 사전에 파악하세요.
            <br />
            <span className="text-gray-400 text-xs">
              🟢 안정(0~50%) &nbsp; 🔵 양호(51~70%) &nbsp; 🟡 주의(71~85%) &nbsp; 🟠 위험(86~95%) &nbsp; 🔴 폭발직전(96~100%)
            </span>
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 통계 줄 */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* 총 비용 */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
          <DollarSign className="h-4 w-4 text-gray-400" />
          <div>
            <p className="text-[10px] text-gray-400 leading-none">이번 달 예상 총 비용</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">
              ${data.totalMonthlyCostUsd.toFixed(2)}
              <span className="ml-1 text-xs font-normal text-gray-400">/ 월</span>
            </p>
          </div>
        </div>

        {/* 전체 상태 */}
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 shadow-sm ${label.cls}`}>
          {label.icon}
          <span className="text-sm font-semibold">{label.text}</span>
        </div>

        {/* 상태별 카운트 */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>🔴 {countByStatus.critical}</span>
          <span>🟠 {countByStatus.warning}</span>
          <span>🟡 {countByStatus.caution}</span>
          <span>🔵 {countByStatus.good}</span>
          <span>🟢 {countByStatus.stable}</span>
          <span className="text-gray-300">|</span>
          <span>총 {data.services.length}개 서비스</span>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-gray-400">
        마지막 업데이트: {updatedAt} &nbsp;·&nbsp; 사용량은 환경변수 또는 기본 추정값 기반입니다.
        실시간 연동이 필요하면 각 서비스 콘솔에서 직접 확인하세요.
      </p>
    </div>
  );
}
