'use client';
import { cn } from '@/lib/utils';

const GRADIENT: Record<string, string> = {
  indigo: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 35%, #4338ca 65%, #6366f1 100%)',
  purple: 'linear-gradient(135deg, #2e1065 0%, #4c1d95 35%, #6d28d9 65%, #8b5cf6 100%)',
  green:  'linear-gradient(135deg, #052e16 0%, #14532d 35%, #15803d 65%, #22c55e 100%)',
  amber:  'linear-gradient(135deg, #451a03 0%, #78350f 35%, #b45309 65%, #f59e0b 100%)',
  rose:   'linear-gradient(135deg, #4c0519 0%, #881337 35%, #be123c 65%, #f43f5e 100%)',
  slate:  'linear-gradient(135deg, #020617 0%, #0f172a 35%, #1e293b 65%, #334155 100%)',
};

interface PageHeroStat { label: string; value: string | number; }

interface PageHeroProps {
  badge: string;
  title: string;
  subtitle?: string;
  variant?: keyof typeof GRADIENT;
  stats?: PageHeroStat[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHero({ badge, title, subtitle, variant = 'indigo', stats, actions, className }: PageHeroProps) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-2xl px-8 py-7', className)}
      style={{ background: GRADIENT[variant] ?? GRADIENT['indigo'] }}
    >
      {/* decorative blobs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-0 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">{badge}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {stats && stats.length > 0 ? (
            <div className="flex items-center gap-0 divide-x divide-white/20 rounded-xl bg-white/10 px-1 backdrop-blur-sm ring-1 ring-white/10">
              {stats.map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center px-5 py-3">
                  <span className="text-xl font-bold text-white">{value}</span>
                  <span className="text-[11px] text-white/50">{label}</span>
                </div>
              ))}
            </div>
          ) : null}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
