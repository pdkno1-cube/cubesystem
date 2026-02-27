import type { Database } from './database';

// ── Core DB types ──────────────────────────────────────────────────
export type Workspace = Database['public']['Tables']['workspaces']['Row'];
export type WorkspaceInsert = Database['public']['Tables']['workspaces']['Insert'];
export type WorkspaceUpdate = Database['public']['Tables']['workspaces']['Update'];

// ── Category constants ─────────────────────────────────────────────
export const WORKSPACE_CATEGORIES = [
  { value: 'logistics', label: '물류' },
  { value: 'it', label: 'IT' },
  { value: 'fnb', label: 'F&B' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'marketing', label: '마케팅' },
  { value: 'finance', label: '금융' },
  { value: 'other', label: '기타' },
] as const;

export type WorkspaceCategory = (typeof WORKSPACE_CATEGORIES)[number]['value'];

// ── Icon constants ─────────────────────────────────────────────────
export const WORKSPACE_ICONS = [
  'Building2',
  'Truck',
  'Monitor',
  'UtensilsCrossed',
  'ShoppingCart',
  'Megaphone',
  'Landmark',
  'Briefcase',
] as const;

export type WorkspaceIcon = (typeof WORKSPACE_ICONS)[number];

// ── Status type ───────────────────────────────────────────────────
export type WorkspaceStatus = 'active' | 'archived' | 'suspended';

// ── API input/output shapes ────────────────────────────────────────
export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
  description?: string;
  category?: WorkspaceCategory;
  icon?: WorkspaceIcon;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  category?: WorkspaceCategory;
  icon?: WorkspaceIcon;
  settings?: Record<string, unknown>;
  status?: WorkspaceStatus;
}

export interface WorkspaceWithStats extends Workspace {
  agent_count: number;
  active_pipeline_count: number;
  credit_balance: number;
  member_count: number;
  category?: WorkspaceCategory;
  icon?: WorkspaceIcon;
}

// ── API response shapes ────────────────────────────────────────────
export interface WorkspaceListResponse {
  data: WorkspaceWithStats[];
  count: number;
}

export interface WorkspaceDetailResponse {
  data: WorkspaceWithStats;
}

export interface WorkspaceCreateResponse {
  data: Workspace;
}

export interface WorkspaceUpdateResponse {
  data: Workspace;
}

export interface WorkspaceDeleteResponse {
  success: boolean;
}

export interface ApiError {
  code: string;
  message: string;
}
