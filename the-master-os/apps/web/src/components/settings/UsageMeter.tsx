import { calcStatus, isMetricConfigured, STATUS_CONFIG, type UsageMetric } from './infra-service-config';

interface UsageMeterProps {
  metric: UsageMetric;
}

function formatValue(value: number, unit: string): string {
  if (unit === 'USD') {return `$${value.toFixed(2)}`;}
  if (unit === 'MB' && value >= 1024) {return `${(value / 1024).toFixed(1)} GB`;}
  if (unit === '회' || unit === 'MAU' || unit === '건' || unit === '통') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  }
  return `${value} ${unit}`;
}

function formatLimit(limit: number, unit: string): string {
  if (unit === 'USD') {return `$${limit}`;}
  if (unit === 'MB' && limit >= 1024) {return `${(limit / 1024).toFixed(0)} GB`;}
  if (unit === '회' || unit === 'MAU' || unit === '건' || unit === '통') {
    return limit >= 1000 ? `${(limit / 1000).toFixed(0)}k` : String(limit);
  }
  return `${limit} ${unit}`;
}

export function UsageMeter({ metric }: UsageMeterProps) {
  const configured = isMetricConfigured(metric);

  if (!configured) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{metric.label}</span>
          <span className="font-medium text-gray-400">
            미설정
            <span className="text-gray-300"> / {formatLimit(metric.limit, metric.unit)}</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gray-200" style={{ width: '0%' }} />
        </div>
        <div className="flex justify-end">
          <span className="text-[10px] font-medium text-gray-400">
            데이터 없음
          </span>
        </div>
      </div>
    );
  }

  const currentValue = metric.current ?? 0;
  const status = calcStatus(metric.usagePercent);
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {metric.label}
          {metric.source === 'env' && (
            <span className="ml-1 text-[10px] text-gray-300" title="환경변수에서 읽은 값">(env)</span>
          )}
        </span>
        <span className="font-medium text-gray-700">
          {formatValue(currentValue, metric.unit)}
          <span className="text-gray-400"> / {formatLimit(metric.limit, metric.unit)}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${cfg.barClass}`}
          style={{ width: `${metric.usagePercent}%` }}
        />
      </div>
      <div className="flex justify-end">
        <span className={`text-[10px] font-medium ${cfg.textClass}`}>
          {metric.usagePercent}% 사용
        </span>
      </div>
    </div>
  );
}
