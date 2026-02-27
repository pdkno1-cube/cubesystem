'use client';

import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, ArrowUpCircle } from 'lucide-react';
import { STATUS_CONFIG, type ServiceData } from './infra-service-config';
import { StatusBadge } from './StatusBadge';
import { UsageMeter } from './UsageMeter';

interface ServiceCardProps {
  service: ServiceData;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[service.status];
  const showUpgradeHint = service.status === 'caution' || service.status === 'warning' || service.status === 'critical';

  return (
    <div className={`rounded-xl border ${cfg.borderClass} bg-white shadow-sm transition-shadow hover:shadow-md`}>
      {/* 카드 헤더 */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3">
          {/* 로고 이모지 */}
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl ${cfg.bgClass}`}>
            {service.logoEmoji}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{service.name}</h3>
              <StatusBadge status={service.status} size="sm" />
            </div>
            <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{service.description}</p>
            <p className="mt-1 text-xs text-gray-400">
              요금제: <span className="font-medium text-gray-600">{service.currentPlan}</span>
            </p>
          </div>
        </div>

        {/* 비용 + 확장 버튼 */}
        <div className="flex shrink-0 flex-col items-end gap-2 pl-2">
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{service.costLabel}</p>
            {service.isVariableCost && (
              <p className="text-[10px] text-gray-400">변동 요금</p>
            )}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={expanded ? '접기' : '자세히 보기'}
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" /> 접기</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" /> 상세</>
            )}
          </button>
        </div>
      </div>

      {/* 사용량 바 (항상 표시) */}
      {service.metrics.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {service.metrics.map((m) => (
            <UsageMeter key={m.label} metric={m} />
          ))}
        </div>
      )}

      {/* 상태 설명 */}
      <div className={`mx-4 mb-3 rounded-lg px-3 py-2 text-xs ${cfg.bgClass} ${cfg.textClass}`}>
        {cfg.emoji} {cfg.description}
      </div>

      {/* 확장 영역 — 업그레이드 정보 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 rounded-b-xl space-y-3">
          <div className="flex items-start gap-2">
            <ArrowUpCircle className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-700">
                다음 플랜: {service.upgrade.nextPlan}
                {service.upgrade.nextPlanCostUsd > 0 && (
                  <span className="ml-1 text-gray-500">(${service.upgrade.nextPlanCostUsd}/월)</span>
                )}
              </p>
              <p className="text-xs text-gray-500">{service.upgrade.keyBenefit}</p>
              <p className="text-xs text-gray-400">
                📌 업그레이드 시점: {service.upgrade.triggerCondition}
              </p>
            </div>
          </div>

          <a
            href={service.upgrade.consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            콘솔 열기
          </a>
        </div>
      )}

      {/* 경고 배너 (위험/폭발직전) */}
      {showUpgradeHint && !expanded && (
        <div className={`border-t ${cfg.borderClass} px-4 py-2 rounded-b-xl ${cfg.bgClass}`}>
          <p className={`text-xs font-medium ${cfg.textClass}`}>
            ⚠ {service.upgrade.triggerCondition} — 상세를 눌러 업그레이드 경로 확인
          </p>
        </div>
      )}
    </div>
  );
}
