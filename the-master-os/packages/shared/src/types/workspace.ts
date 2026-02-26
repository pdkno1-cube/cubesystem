// 사용자 역할
export type UserRole = "owner" | "admin" | "member" | "viewer";

// 사용자
export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// 워크스페이스 설정
export interface WorkspaceSettings {
  timezone: string;
  language: string;
  max_agents: number;
}

// 워크스페이스
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  owner_id: string;
  is_active: boolean;
  settings: WorkspaceSettings;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// 워크스페이스 멤버 역할
export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer";

// 워크스페이스 멤버
export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}
