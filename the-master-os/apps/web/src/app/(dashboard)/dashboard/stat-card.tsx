'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  suffix?: string;
  subValue?: string;
  color?: 'brand' | 'green' | 'amber' | 'purple' | 'red';
}

const COLOR_MAP: Record<
  string,
  { iconBg: string; iconText: string }
> = {
  brand: { iconBg: 'bg-brand-50', iconText: 'text-brand-600' },
  green: { iconBg: 'bg-green-50', iconText: 'text-green-600' },
  amber: { iconBg: 'bg-amber-50', iconText: 'text-amber-600' },
  purple: { iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600' },
};

export function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  subValue,
  color = 'brand',
}: StatCardProps) {
  const colorConfig = COLOR_MAP[color] ?? { iconBg: 'bg-brand-50', iconText: 'text-brand-600' };

  return (
    <div
      role="status"
      aria-label={`${label}: ${value}${suffix ? ` ${suffix}` : ''}`}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            colorConfig.iconBg
          )}
        >
          <Icon className={cn('h-5 w-5', colorConfig.iconText)} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          {suffix ? (
            <span className="text-sm text-gray-500">{suffix}</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-gray-500">{label}</p>
        {subValue ? (
          <p className="mt-1 text-xs text-gray-400">{subValue}</p>
        ) : null}
      </div>
    </div>
  );
}
