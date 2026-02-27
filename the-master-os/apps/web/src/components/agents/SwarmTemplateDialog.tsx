'use client';

import { useState, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Users,
  Zap,
  FileText,
  Megaphone,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Swarm template definitions
// ---------------------------------------------------------------------------

interface SwarmAgentDef {
  name: string;
  description: string;
  category:
    | 'planning'
    | 'writing'
    | 'marketing'
    | 'audit'
    | 'devops'
    | 'ocr'
    | 'scraping'
    | 'analytics'
    | 'finance'
    | 'general';
  model_provider: 'openai' | 'anthropic' | 'google' | 'local';
  model: string;
  system_prompt: string;
}

interface SwarmTemplate {
  id: string;
  name: string;
  description: string;
  icon: 'planning' | 'marketing' | 'document';
  agents: SwarmAgentDef[];
}

const SWARM_TEMPLATES: SwarmTemplate[] = [
  {
    id: 'planning-swarm',
    name: 'Planning Swarm',
    description: '전략 기획, 시장 분석, 사업 계획을 위한 3인 에이전트 팀',
    icon: 'planning',
    agents: [
      {
        name: 'OptimistAgent',
        description: '사업 아이디어의 긍정적 측면과 기회를 분석',
        category: 'planning',
        model_provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt:
          '당신은 사업 아이디어의 긍정적 측면을 분석하는 낙관론자 에이전트입니다. 시장 기회, 성장 가능성, 차별화 포인트를 중심으로 분석하세요. 구체적인 데이터와 사례를 들어 설명하세요.',
      },
      {
        name: 'CriticAgent',
        description: '리스크, 약점, 잠재적 실패 요인을 비판적으로 검토',
        category: 'planning',
        model_provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt:
          '당신은 사업 아이디어의 리스크와 약점을 분석하는 비평가 에이전트입니다. 시장 위험, 경쟁 위협, 재무 리스크, 실행 가능성 문제를 중심으로 비판적으로 검토하세요.',
      },
      {
        name: 'SynthesizerAgent',
        description: '낙관론과 비판을 종합하여 실행 가능한 전략 도출',
        category: 'planning',
        model_provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt:
          '당신은 다양한 관점을 종합하여 실행 가능한 전략을 도출하는 종합 에이전트입니다. 낙관적 분석과 비판적 분석을 모두 고려하여 균형 잡힌 사업 전략과 실행 계획을 제시하세요.',
      },
    ],
  },
  {
    id: 'osmu-marketing-swarm',
    name: 'OSMU Marketing Swarm',
    description: '원 소스 멀티 유즈 콘텐츠 자동 생성을 위한 5인 에이전트 팀',
    icon: 'marketing',
    agents: [
      {
        name: 'TopicAnalystAgent',
        description: '트렌드 분석 및 콘텐츠 주제 선정',
        category: 'marketing',
        model_provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt:
          '당신은 콘텐츠 마케팅 트렌드 분석 전문가입니다. 시장 트렌드, 검색 키워드, 경쟁사 콘텐츠를 분석하여 최적의 콘텐츠 주제를 선정하세요. SEO 키워드와 타겟 오디언스를 명확히 제시하세요.',
      },
      {
        name: 'BlogWriterAgent',
        description: '롱폼 블로그 콘텐츠 작성',
        category: 'writing',
        model_provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt:
          '당신은 전문적인 블로그 콘텐츠 작성 에이전트입니다. SEO에 최적화된 2000자 이상의 롱폼 블로그 글을 작성하세요. 제목, 소제목, 핵심 키워드, CTA를 포함하세요.',
      },
      {
        name: 'InstaCreatorAgent',
        description: '인스타그램 캐러셀 카드 콘텐츠 생성',
        category: 'marketing',
        model_provider: 'openai',
        model: 'gpt-4o',
        system_prompt:
          '당신은 인스타그램 마케팅 전문가입니다. 블로그 콘텐츠를 기반으로 인스타그램 캐러셀 카드용 텍스트(5-7장)를 생성하세요. 각 카드는 핵심 메시지, 비주얼 가이드, 해시태그를 포함하세요.',
      },
      {
        name: 'NewsletterAgent',
        description: '이메일 뉴스레터 콘텐츠 변환',
        category: 'marketing',
        model_provider: 'anthropic',
        model: 'claude-haiku',
        system_prompt:
          '당신은 이메일 마케팅 전문가입니다. 블로그 콘텐츠를 뉴스레터 형식으로 변환하세요. 매력적인 제목, 프리헤더, 본문 요약, CTA 버튼 텍스트를 포함하세요.',
      },
      {
        name: 'ShortFormAgent',
        description: '숏폼 영상 스크립트 작성',
        category: 'marketing',
        model_provider: 'openai',
        model: 'gpt-4o',
        system_prompt:
          '당신은 숏폼 영상 스크립트 전문가입니다. 블로그 콘텐츠를 60초 이내 숏폼 영상 스크립트로 변환하세요. 훅, 본문, CTA 구조로 작성하고 자막 타이밍 가이드를 포함하세요.',
      },
    ],
  },
  {
    id: 'document-validation-swarm',
    name: 'Document Validation Swarm',
    description: '문서 검증, 규정 준수 검사, 품질 관리를 위한 4인 에이전트 팀',
    icon: 'document',
    agents: [
      {
        name: 'FormatCheckerAgent',
        description: '문서 형식 및 구조 검증',
        category: 'audit',
        model_provider: 'anthropic',
        model: 'claude-haiku',
        system_prompt:
          '당신은 문서 형식 검증 에이전트입니다. 문서의 구조, 형식, 필수 항목 포함 여부를 검사하세요. 목차, 페이지 번호, 표/그림 번호 체계, 참고문헌 형식을 확인하세요.',
      },
      {
        name: 'ComplianceAgent',
        description: '법률 및 규정 준수 여부 검토',
        category: 'audit',
        model_provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt:
          '당신은 법률 및 규정 준수 검토 에이전트입니다. 문서 내용이 관련 법률, 규정, 내부 정책을 준수하는지 검토하세요. 위반 사항이나 리스크를 식별하고 개선 방안을 제시하세요.',
      },
      {
        name: 'DataVerifierAgent',
        description: '숫자, 통계, 데이터 정확성 검증',
        category: 'analytics',
        model_provider: 'openai',
        model: 'gpt-4o',
        system_prompt:
          '당신은 데이터 검증 에이전트입니다. 문서에 포함된 숫자, 통계, 재무 데이터의 정확성과 일관성을 검증하세요. 계산 오류, 데이터 불일치, 출처 누락을 식별하세요.',
      },
      {
        name: 'QualityReporterAgent',
        description: '종합 품질 보고서 생성',
        category: 'audit',
        model_provider: 'anthropic',
        model: 'claude-sonnet',
        system_prompt:
          '당신은 문서 품질 종합 보고서 생성 에이전트입니다. 형식 검증, 규정 준수, 데이터 검증 결과를 종합하여 품질 점수와 개선 우선순위를 포함한 최종 보고서를 생성하세요.',
      },
    ],
  },
];

const ICON_MAP = {
  planning: Zap,
  marketing: Megaphone,
  document: FileText,
} as const;

const ICON_COLOR_MAP = {
  planning: 'bg-purple-100 text-purple-600',
  marketing: 'bg-pink-100 text-pink-600',
  document: 'bg-amber-100 text-amber-600',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SwarmTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type CreationPhase = 'select' | 'creating' | 'done';

interface CreationProgress {
  total: number;
  completed: number;
  currentAgent: string;
  errors: string[];
}

export function SwarmTemplateDialog({
  open,
  onClose,
  onCreated,
}: SwarmTemplateDialogProps) {
  const { createAgent } = useAgentStore();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [phase, setPhase] = useState<CreationPhase>('select');
  const [progress, setProgress] = useState<CreationProgress>({
    total: 0,
    completed: 0,
    currentAgent: '',
    errors: [],
  });

  const resetState = useCallback(() => {
    setSelectedTemplate(null);
    setPhase('select');
    setProgress({ total: 0, completed: 0, currentAgent: '', errors: [] });
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetState();
        onClose();
      }
    },
    [resetState, onClose]
  );

  const handleCreate = useCallback(async () => {
    const template = SWARM_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) {
      return;
    }

    setPhase('creating');
    const errors: string[] = [];
    const total = template.agents.length;

    for (let i = 0; i < total; i++) {
      const agentDef = template.agents[i];
      if (!agentDef) {
        continue;
      }

      setProgress({
        total,
        completed: i,
        currentAgent: agentDef.name,
        errors,
      });

      try {
        await createAgent({
          name: agentDef.name,
          description: agentDef.description,
          category: agentDef.category,
          model_provider: agentDef.model_provider,
          model: agentDef.model,
          system_prompt: agentDef.system_prompt,
        });
      } catch (err) {
        Sentry.captureException(err, {
          tags: { context: 'swarm.template.create' },
          extra: { agentName: agentDef.name, templateId: template.id },
        });
        const message =
          err instanceof Error
            ? err.message
            : `${agentDef.name} 생성 실패`;
        errors.push(message);
      }
    }

    setProgress({ total, completed: total, currentAgent: '', errors });
    setPhase('done');
  }, [selectedTemplate, createAgent]);

  const handleDone = useCallback(() => {
    toast({
      title: '스웜 에이전트 생성 완료',
      description: '파이프라인 페이지에서 생성된 에이전트를 연결하세요.',
      variant: 'success',
    });
    resetState();
    onCreated();
  }, [resetState, onCreated, toast]);

  const currentTemplate = SWARM_TEMPLATES.find(
    (t) => t.id === selectedTemplate
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              {phase === 'select'
                ? '스웜 템플릿 선택'
                : phase === 'creating'
                  ? '에이전트 생성 중...'
                  : '스웜 생성 완료'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-gray-500">
            {phase === 'select'
              ? '사전 구성된 에이전트 그룹 템플릿을 선택하여 한 번에 생성합니다.'
              : phase === 'creating'
                ? '에이전트를 순차적으로 생성하고 있습니다.'
                : '모든 에이전트가 생성되었습니다.'}
          </Dialog.Description>

          {/* Template Selection Phase */}
          {phase === 'select' ? (
            <>
              <div className="mt-6 space-y-3">
                {SWARM_TEMPLATES.map((template) => {
                  const IconComp = ICON_MAP[template.icon];
                  const iconColorClass = ICON_COLOR_MAP[template.icon];
                  const isSelected = selectedTemplate === template.id;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplate(template.id)}
                      className={cn(
                        'flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-all',
                        isSelected
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                          iconColorClass
                        )}
                      >
                        <IconComp className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {template.name}
                          </h3>
                          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                            <Users className="h-3 w-3" />
                            {template.agents.length}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {template.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.agents.map((agent) => (
                            <span
                              key={agent.name}
                              className="inline-flex items-center rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200"
                            >
                              {agent.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Template Detail */}
              {currentTemplate ? (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    포함 에이전트 상세
                  </h4>
                  <div className="mt-3 space-y-2">
                    {currentTemplate.agents.map((agent) => (
                      <div
                        key={agent.name}
                        className="flex items-start gap-3 rounded-md bg-white p-3 ring-1 ring-gray-200"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {agent.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {agent.description}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              {agent.model_provider}/{agent.model}
                            </span>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              {agent.category}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!selectedTemplate}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Users className="h-4 w-4" />
                  스웜 생성
                  {currentTemplate
                    ? ` (${currentTemplate.agents.length}개 에이전트)`
                    : ''}
                </button>
              </div>
            </>
          ) : null}

          {/* Creating Phase */}
          {phase === 'creating' ? (
            <div className="mt-6 space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {progress.currentAgent} 생성 중...
                  </span>
                  <span className="font-medium text-gray-900">
                    {progress.completed}/{progress.total}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-300"
                    style={{
                      width: `${
                        progress.total > 0
                          ? (progress.completed / progress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              </div>

              {progress.errors.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-700">
                    오류 발생:
                  </p>
                  {progress.errors.map((errMsg, idx) => (
                    <p
                      key={`err-${idx}`}
                      className="mt-1 text-xs text-red-600"
                    >
                      {errMsg}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Done Phase */}
          {phase === 'done' ? (
            <div className="mt-6 space-y-4">
              <div className="flex flex-col items-center py-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="mt-3 text-sm font-medium text-gray-900">
                  {progress.completed - progress.errors.length}개 에이전트 생성
                  완료
                </p>
                {progress.errors.length > 0 ? (
                  <p className="mt-1 text-xs text-red-600">
                    {progress.errors.length}개 실패
                  </p>
                ) : null}
              </div>

              {progress.errors.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-700">
                    실패 목록:
                  </p>
                  {progress.errors.map((errMsg, idx) => (
                    <p
                      key={`done-err-${idx}`}
                      className="mt-1 text-xs text-red-600"
                    >
                      {errMsg}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleDone}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  확인
                </button>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
