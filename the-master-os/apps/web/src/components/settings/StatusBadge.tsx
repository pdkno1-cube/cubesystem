import { STATUS_CONFIG, type ServiceStatus } from './infra-service-config';

interface StatusBadgeProps {
  status: ServiceStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${padding} ${cfg.bgClass} ${cfg.borderClass} ${cfg.textClass} border`}
    >
      <span className="text-[10px] leading-none">{cfg.emoji}</span>
      {cfg.label}
    </span>
  );
}
