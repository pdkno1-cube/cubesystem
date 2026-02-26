// 파이프라인 카테고리
export type PipelineCategory =
  | "grant_factory"
  | "document_verification"
  | "osmu_marketing"
  | "auto_healing"
  | "custom";

// 파이프라인 실행 상태
export type PipelineExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

// 파이프라인 단계 상태
export type PipelineStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "retrying";

// 파이프라인 그래프 정의
export interface PipelineGraphDefinition {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    agent_slug?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    condition?: string;
  }>;
  entry_point: string;
}

// 파이프라인
export interface Pipeline {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: PipelineCategory;
  graph_definition: PipelineGraphDefinition;
  required_agents: string[];
  required_mcps: string[];
  is_system: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

// 파이프라인 실행
export interface PipelineExecution {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  triggered_by: string;
  status: PipelineExecutionStatus;
  input_params: Record<string, unknown>;
  output_result: Record<string, unknown> | null;
  error_message: string | null;
  total_credits: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

// 파이프라인 단계
export interface PipelineStep {
  id: string;
  execution_id: string;
  step_name: string;
  step_order: number;
  agent_id: string | null;
  status: PipelineStepStatus;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  credits_used: number;
  retry_count: number;
  max_retries: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}
