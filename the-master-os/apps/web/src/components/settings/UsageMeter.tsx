import { calcStatus, STATUS_CONFIG, type UsageMetric } from './infra-service-config';

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
  const status = calcStatus(metric.usagePercent);
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{metric.label}</span>
        <span className="font-medium text-gray-700">
          {formatValue(metric.current, metric.unit)}
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
