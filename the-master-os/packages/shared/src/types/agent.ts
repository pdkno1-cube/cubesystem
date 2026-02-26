// 에이전트 카테고리
export type AgentCategory =
  | "planning"
  | "writing"
  | "marketing"
  | "audit"
  | "devops"
  | "ocr"
  | "scraping"
  | "analytics"
  | "finance"
  | "general";

// 에이전트 할당 상태
export type AgentAssignmentStatus = "idle" | "running" | "paused" | "error";

// 에이전트 모델 프로바이더
export type AgentModelProvider = "openai" | "anthropic" | "google" | "local";

// 에이전트 파라미터
export interface AgentParameters {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

// 에이전트
export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: AgentCategory;
  model_provider: AgentModelProvider;
  model_name: string;
  system_prompt: string;
  parameters: AgentParameters;
  is_system: boolean;
  is_active: boolean;
  cost_per_run: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// 에이전트 할당
export interface AgentAssignment {
  id: string;
  agent_id: string;
  workspace_id: string;
  assigned_by: string;
  position_x: number | null;
  position_y: number | null;
  config_override: Record<string, unknown>;
  status: AgentAssignmentStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
