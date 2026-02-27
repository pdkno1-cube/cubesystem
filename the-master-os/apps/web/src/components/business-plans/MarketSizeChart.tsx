'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────

interface MarketSizeChartProps {
  tam: number;
  sam: number;
  som: number;
}

interface ChartDataItem {
  name: string;
  value: number;
  fill: string;
  label: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKRW(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}조원`;
  }
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(0)}억원`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(0)}만원`;
  }
  return `${value}원`;
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataItem }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const item = payload[0]?.payload;
  if (!item) {
    return null;
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold" style={{ color: item.fill }}>
        {item.label}
      </p>
      <p className="text-sm text-gray-700">{formatKRW(item.value)}</p>
    </div>
  );
}

// ── Chart Component ────────────────────────────────────────────────────────

export function MarketSizeChart({ tam, sam, som }: MarketSizeChartProps) {
  // Concentric donut: TAM outer, SAM middle, SOM inner
  const tamData: ChartDataItem[] = [
    { name: 'TAM', value: tam, fill: '#c7d2fe', label: 'TAM (전체 시장)' },
  ];

  const samData: ChartDataItem[] = [
    { name: 'SAM', value: sam, fill: '#818cf8', label: 'SAM (서비스 가능 시장)' },
    { name: 'SAM-gap', value: Math.max(0, tam - sam), fill: 'transparent', label: '' },
  ];

  const somData: ChartDataItem[] = [
    { name: 'SOM', value: som, fill: '#4f46e5', label: 'SOM (획득 가능 시장)' },
    { name: 'SOM-gap', value: Math.max(0, sam - som), fill: 'transparent', label: '' },
  ];

  if (tam === 0 && sam === 0 && som === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        시장 규모 데이터가 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* TAM - outermost ring */}
            <Pie
              data={tamData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={110}
              innerRadius={85}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              {tamData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>

            {/* SAM - middle ring */}
            <Pie
              data={samData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={55}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              {samData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>

            {/* SOM - innermost ring */}
            <Pie
              data={somData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={50}
              innerRadius={25}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
            >
              {somData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>

            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#c7d2fe]" />
          <span className="text-xs text-gray-600">TAM {formatKRW(tam)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#818cf8]" />
          <span className="text-xs text-gray-600">SAM {formatKRW(sam)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#4f46e5]" />
          <span className="text-xs text-gray-600">SOM {formatKRW(som)}</span>
        </div>
      </div>
    </div>
  );
}
