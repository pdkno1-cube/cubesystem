'use client';

import { useState, useEffect, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Loader2 } from 'lucide-react';
import type { InfraStatusResponse } from './infra-service-config';
import { InfraHeader } from './InfraHeader';
import { ServiceCard } from './ServiceCard';

export function InfraSection() {
  const [data, setData] = useState<InfraStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/infra-status', { cache: 'no-store' });
      if (!res.ok) {throw new Error(`HTTP ${res.status}`);}
      const json: InfraStatusResponse = await res.json();
      setData(json);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'settings.infra.fetch' } });
      setError('데이터를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">서비스 현황 불러오는 중...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-xs text-red-600 underline hover:text-red-800"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) {return null;}

  return (
    <div className="space-y-5">
      {/* 헤더 — 총 비용 + 전체 상태 */}
      <InfraHeader data={data} onRefresh={fetchData} isLoading={isLoading} />

      {/* 서비스 카드 그리드 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
        {data.services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>

      {/* 하단 안내 */}
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-400 leading-relaxed">
          💡 <strong>서비스가 커지면?</strong> — 각 카드 하단의 &ldquo;상세&rdquo;를 눌러 업그레이드 경로와 트리거 조건을 확인하세요.
          실시간 사용량 연동은 환경변수(<code className="bg-gray-200 px-0.5 rounded text-[10px]">VERCEL_BANDWIDTH_GB</code>,
          <code className="bg-gray-200 px-0.5 rounded text-[10px] ml-1">SUPABASE_DB_MB</code> 등)로 주입 가능합니다.
        </p>
      </div>
    </div>
  );
}
