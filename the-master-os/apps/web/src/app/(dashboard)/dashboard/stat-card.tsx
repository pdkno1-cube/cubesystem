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
  { stripe: string; iconFrom: string; iconTo: string }
> = {
  brand:  { stripe: 'bg-brand-500',  iconFrom: 'from-brand-400',  iconTo: 'to-brand-600'  },
  green:  { stripe: 'bg-green-500',  iconFrom: 'from-green-400',  iconTo: 'to-green-600'  },
  amber:  { stripe: 'bg-amber-500',  iconFrom: 'from-amber-400',  iconTo: 'to-amber-600'  },
  purple: { stripe: 'bg-purple-500', iconFrom: 'from-purple-400', iconTo: 'to-purple-600' },
  red:    { stripe: 'bg-rose-500',   iconFrom: 'from-rose-400',   iconTo: 'to-rose-600'   },
};

const DEFAULT_COLOR = COLOR_MAP['brand'] as NonNullable<typeof COLOR_MAP[string]>;

export function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  subValue,
  color = 'brand',
}: StatCardProps) {
  const c = COLOR_MAP[color] ?? DEFAULT_COLOR;

  return (
    <div
      role="status"
      aria-label={`${label}: ${value}${suffix ? ` ${suffix}` : ''}`}
      className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      {/* Top accent stripe */}
      <div className={cn('h-1 w-full', c.stripe)} />

      <div className="px-5 pb-5 pt-4">
        {/* Icon */}
        <div
          className={cn(
            'inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm',
            c.iconFrom,
            c.iconTo,
          )}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>

        {/* Numbers */}
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            {label}
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-gray-900">{value}</span>
            {suffix ? (
              <span className="text-sm text-gray-500">{suffix}</span>
            ) : null}
          </div>
          {subValue ? (
            <p className="mt-1 text-xs text-gray-400">{subValue}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
