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
    description: '정부조달 공고 수집 -> 적합성 분석 -> 입찰서류 생성 자동화 파이프라인',
    category: 'grant_factory',
    graph_definition: {
      nodes: [
        { id: 'validate_input', type: 'validation', label: '입력 검증' },
        { id: 'crawl_announcements', type: 'mcp_call', label: '공고 수집 (FireCrawl)' },
        { id: 'analyze_eligibility', type: 'agent_call', label: '적합성 분석 (OptimistAgent + CriticAgent)' },
        { id: 'generate_documents', type: 'agent_call', label: '서류 생성 (BlogAgent)' },
        { id: 'review_documents', type: 'agent_call', label: '서류 검토 (RealistAgent)' },
        { id: 'finalize', type: 'output', label: '최종 결과 저장' },
      ],
      edges: [
        { from: 'validate_input', to: 'crawl_announcements' },
        { from: 'crawl_announcements', to: 'analyze_eligibility' },
        { from: 'analyze_eligibility', to: 'generate_documents' },
        { from: 'generate_documents', to: 'review_documents' },
        { from: 'review_documents', to: 'finalize' },
      ],
      entry_point: 'validate_input',
    },
    required_agents: ['optimist-agent', 'critic-agent', 'realist-agent', 'blog-agent'],
    required_mcps: ['firecrawl'],
    is_system: true,
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
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
    description: 'One Source Multi Use 마케팅 콘텐츠 자동 생성 파이프라인 (블로그, SNS, 보고서)',
    category: 'osmu_marketing',
    graph_definition: {
      nodes: [
        { id: 'validate_input', type: 'validation', label: '입력 검증' },
        { id: 'analyze_topic', type: 'agent_call', label: '주제 분석 (RealistAgent)' },
        { id: 'generate_blog', type: 'agent_call', label: '블로그 생성 (BlogAgent)' },
        { id: 'generate_sns', type: 'agent_call', label: 'SNS 콘텐츠 생성 (BlogAgent)' },
        { id: 'generate_report', type: 'agent_call', label: '보고서 생성 (RealistAgent)' },
        { id: 'review_all', type: 'agent_call', label: '전체 검토 (CriticAgent)' },
        { id: 'finalize', type: 'output', label: '결과 저장 및 배포' },
      ],
      edges: [
        { from: 'validate_input', to: 'analyze_topic' },
        { from: 'analyze_topic', to: 'generate_blog' },
        { from: 'analyze_topic', to: 'generate_sns' },
        { from: 'analyze_topic', to: 'generate_report' },
        { from: 'generate_blog', to: 'review_all' },
        { from: 'generate_sns', to: 'review_all' },
        { from: 'generate_report', to: 'review_all' },
        { from: 'review_all', to: 'finalize' },
      ],
      entry_point: 'validate_input',
    },
    required_agents: ['realist-agent', 'blog-agent', 'critic-agent'],
    required_mcps: ['google_drive', 'figma'],
    is_system: true,
    is_active: true,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
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
  } catch {
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
