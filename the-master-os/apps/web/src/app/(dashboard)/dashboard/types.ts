export interface CanvasAgent {
  id: string;
  name: string;
  model: string;
  category: string;
  status: 'idle' | 'running' | 'paused' | 'error';
}

export interface WorkspaceOverview {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  created_at: string;
  agent_count: number;
  active_agents: number;
  pipeline_queued: number;
  pipeline_running: number;
  pipeline_completed: number;
  pipeline_error: number;
  credit_balance: number;
  assigned_agents?: CanvasAgent[];
}

export interface PipelineExecution {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  started_at: string | null;
  completed_at: string | null;
  total_credits: number;
  created_at: string;
  pipelines: {
    id: string;
    name: string;
    slug: string;
    category: string;
  } | null;
  workspaces: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  user_id: string | null;
  created_at: string;
}

export interface SystemHealth {
  fastapi: 'healthy' | 'unhealthy' | 'unknown';
  supabase: 'healthy' | 'unhealthy' | 'unknown';
  mcp: {
    connected: number;
    total: number;
  };
}

export interface DashboardData {
  workspaces: {
    total: number;
    list: WorkspaceOverview[];
  };
  agents: {
    total: number;
    pool: number;
    active: number;
    paused: number;
    category_breakdown: Record<string, number>;
  };
  pipelines: {
    running: number;
    completed: number;
    error: number;
    today_executions: number;
    recent: PipelineExecution[];
  };
  credits: {
    total_balance: number;
    recent_usage: number;
  };
  content: {
    published_this_week: number;
  };
  system_health: SystemHealth;
  audit_logs: AuditLog[];
}
