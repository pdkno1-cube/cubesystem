import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { PipelineClient } from './pipeline-client';
import type { Database } from '@/types/database';

type PipelineRow = Database['public']['Tables']['pipelines']['Row'];

interface GraphNode {
  id: string;
  type: string;
  label: string;
}

interface GraphDefinition {
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string }>;
  entry_point: string;
}

export type PipelineWithMeta = Omit<PipelineRow, 'graph_definition'> & {
  graph_definition: GraphDefinition;
};

interface SimpleWorkspace {
  id: string;
  name: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// Mock fallback pipelines (used when Supabase is not connected)
// ---------------------------------------------------------------------------

const MOCK_PIPELINES: PipelineWithMeta[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    name: 'Grant Factory',
    slug: 'grant-factory',
    description: '나라장터/G2B 조달입찰 공고 자동 탐색 -> 적격 검증 -> 입찰 서류 준비 자동화 파이프라인 (8단계)',
    category: 'grant_factory',
    graph_definition: {
      nodes: [
        { id: 'crawl_tenders', type: 'mcp_call', label: '공고 크롤링 (FireCrawl)' },
        { id: 'filter_eligible', type: 'agent_call', label: '적격 필터링 (OptimistAgent)' },
        { id: 'rag_match', type: 'agent_call', label: 'RAG 매칭 (AnalyticsAgent)' },
        { id: 'persona_debate', type: 'agent_call', label: '페르소나 토론 (Optimist+Critic+Realist)' },
        { id: 'generate_docs', type: 'agent_call', label: '입찰 서류 생성 (BlogAgent)' },
        { id: 'ocr_verify', type: 'mcp_call', label: 'OCR 서류 검증 (PaddleOCR)' },
        { id: 'final_review', type: 'agent_call', label: '최종 검토 (CriticAgent)' },
        { id: 'submit_notify', type: 'output', label: '제출 알림 (Slack)' },
      ],
      edges: [
        { from: 'crawl_tenders', to: 'filter_eligible' },
        { from: 'filter_eligible', to: 'rag_match' },
        { from: 'rag_match', to: 'persona_debate' },
        { from: 'persona_debate', to: 'generate_docs' },
        { from: 'generate_docs', to: 'ocr_verify' },
        { from: 'ocr_verify', to: 'final_review' },
        { from: 'final_review', to: 'submit_notify' },
      ],
      entry_point: 'crawl_tenders',
    },
    required_agents: ['optimist-agent', 'critic-agent', 'realist-agent', 'blog-agent', 'analytics-agent'],
    required_mcps: ['firecrawl', 'paddleocr', 'slack'],
    is_system: true,
    is_active: true,
    version: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-27T00:00:00Z',
    deleted_at: null,
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    name: 'Document Verification',
    slug: 'document-verification',
    description: '사업자등록증, 입찰서류, 세금계산서 등 서류 자동 판독 및 검증 파이프라인',
    category: 'document_verification',
    graph_definition: {
      nodes: [
        { id: 'validate_input', type: 'validation', label: '입력 검증' },
        { id: 'ocr_extract', type: 'mcp_call', label: 'OCR 텍스트 추출 (PaddleOCR)' },
        { id: 'structure_data', type: 'agent_call', label: '데이터 구조화 (OCRAgent)' },
        { id: 'verify_data', type: 'agent_call', label: '데이터 검증 (CriticAgent)' },
        { id: 'store_result', type: 'output', label: '결과 저장 (Google Drive)' },
      ],
      edges: [
        { from: 'validate_input', to: 'ocr_extract' },
        { from: 'ocr_extract', to: 'structure_data' },
        { from: 'structure_data', to: 'verify_data' },
        { from: 'verify_data', to: 'store_result' },
      ],
      entry_point: 'validate_input',
    },
    required_agents: ['ocr-agent', 'critic-agent'],
    required_mcps: ['paddleocr', 'google_drive'],
    is_system: true,
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    name: 'OSMU Marketing',
    slug: 'osmu-marketing',
    description: 'One Source Multi Use 마케팅 파이프라인 v2 — 기획안 1개로 블로그/인스타/뉴스레터/숏폼 4채널 동시 생성 후 뉴스레터 자동 발송',
    category: 'osmu_marketing',
    graph_definition: {
      nodes: [
        { id: 'validate_input', type: 'validation', label: '입력 검증' },
        { id: 'analyze_topic', type: 'agent_call', label: '마케팅 전략 분석 (TopicAnalystAgent)' },
        { id: 'generate_blog', type: 'agent_call', label: '블로그 생성 — 100만 조회수 공식 (BlogWriterV2)' },
        { id: 'generate_insta', type: 'agent_call', label: '인스타 캐러셀 생성 (InstaCreatorAgent)' },
        { id: 'generate_newsletter', type: 'agent_call', label: '뉴스레터 생성 — 오픈율 50%+ (NewsletterAgent)' },
        { id: 'generate_shortform', type: 'agent_call', label: '숏폼 스크립트 생성 — MrBeast 공식 (ShortFormAgent)' },
        { id: 'drive_save', type: 'mcp_call', label: 'Google Drive 저장 (폴더 자동 정리)' },
        { id: 'review_all', type: 'agent_call', label: '전체 품질 검토 (CriticAgent)' },
        { id: 'send_newsletter', type: 'newsletter_send', label: '뉴스레터 구독자 자동 발송 (Resend)' },
        { id: 'finalize', type: 'output', label: '완료 알림 (Slack)' },
      ],
      edges: [
        { from: 'validate_input', to: 'analyze_topic' },
        { from: 'analyze_topic', to: 'generate_blog' },
        { from: 'analyze_topic', to: 'generate_insta' },
        { from: 'analyze_topic', to: 'generate_newsletter' },
        { from: 'analyze_topic', to: 'generate_shortform' },
        { from: 'generate_blog', to: 'drive_save' },
        { from: 'generate_insta', to: 'drive_save' },
        { from: 'generate_newsletter', to: 'drive_save' },
        { from: 'generate_shortform', to: 'drive_save' },
        { from: 'drive_save', to: 'review_all' },
        { from: 'review_all', to: 'send_newsletter' },
        { from: 'send_newsletter', to: 'finalize' },
      ],
      entry_point: 'validate_input',
    },
    required_agents: ['topic-analyst-agent', 'blog-writer-v2', 'insta-creator-agent', 'newsletter-writer', 'shortform-scriptwriter', 'critic-agent'],
    required_mcps: ['google_drive', 'slack', 'resend'],
    is_system: true,
    is_active: true,
    version: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-27T00:00:00Z',
    deleted_at: null,
  },
  {
    id: '30000000-0000-0000-0000-000000000004',
    name: 'Auto-Healing',
    slug: 'auto-healing',
    description: '시스템 장애 감지, 원인 분석, 복구 방안 수립 자동화 파이프라인 (자동 배포 금지)',
    category: 'auto_healing',
    graph_definition: {
      nodes: [
        { id: 'detect_issue', type: 'trigger', label: '장애 감지' },
        { id: 'diagnose', type: 'agent_call', label: '원인 분석 (COOAgent)' },
        { id: 'plan_recovery', type: 'agent_call', label: '복구 계획 수립 (COOAgent)' },
        { id: 'review_plan', type: 'agent_call', label: '복구 계획 검토 (CriticAgent)' },
        { id: 'await_approval', type: 'human_gate', label: '회장 승인 대기' },
        { id: 'execute_recovery', type: 'action', label: '복구 실행' },
        { id: 'verify_recovery', type: 'validation', label: '복구 검증' },
        { id: 'notify', type: 'output', label: '결과 알림 (Slack)' },
      ],
      edges: [
        { from: 'detect_issue', to: 'diagnose' },
        { from: 'diagnose', to: 'plan_recovery' },
        { from: 'plan_recovery', to: 'review_plan' },
        { from: 'review_plan', to: 'await_approval' },
        { from: 'await_approval', to: 'execute_recovery' },
        { from: 'execute_recovery', to: 'verify_recovery' },
        { from: 'verify_recovery', to: 'notify' },
      ],
      entry_point: 'detect_issue',
    },
    required_agents: ['coo-agent', 'critic-agent'],
    required_mcps: ['slack'],
    is_system: true,
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  },
];

const MOCK_WORKSPACES: SimpleWorkspace[] = [
  { id: 'ws-001', name: '엉클로지텍', slug: 'uncle-logitech' },
  { id: 'ws-002', name: 'Cube System', slug: 'cube-system' },
];

// ---------------------------------------------------------------------------
// Server Component
// ---------------------------------------------------------------------------

export default async function PipelinesPage() {
  let pipelines: PipelineWithMeta[] = [];
  let workspaces: SimpleWorkspace[] = [];

  try {
    const supabase = await createClient();

    const { data: pipelinesData } = await supabase
      .from('pipelines')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    const { data: workspacesData } = await supabase
      .from('workspaces')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name', { ascending: true });

    pipelines = (pipelinesData ?? []) as unknown as PipelineWithMeta[];
    workspaces = (workspacesData ?? []) as SimpleWorkspace[];
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'pipelines.page.load' } });
    // Supabase not connected: use mock data
    pipelines = MOCK_PIPELINES;
    workspaces = MOCK_WORKSPACES;
  }

  return (
    <PipelineClient
      initialPipelines={pipelines}
      workspaces={workspaces}
    />
  );
}
