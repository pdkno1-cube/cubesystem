export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_url: string | null;
          role: 'owner' | 'admin' | 'member' | 'viewer';
          is_active: boolean;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          display_name: string;
          avatar_url?: string | null;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
          is_active?: boolean;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          avatar_url?: string | null;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
          is_active?: boolean;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          icon_url: string | null;
          owner_id: string;
          status: 'active' | 'archived' | 'suspended';
          is_active: boolean;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          icon_url?: string | null;
          owner_id: string;
          status?: 'active' | 'archived' | 'suspended';
          is_active?: boolean;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          icon_url?: string | null;
          owner_id?: string;
          status?: 'active' | 'archived' | 'suspended';
          is_active?: boolean;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspaces_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member' | 'viewer';
          invited_by: string | null;
          joined_at: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
          invited_by?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'member' | 'viewer';
          invited_by?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      agents: {
        Row: {
          id: string;
          name: string;
          display_name: string;
          slug: string;
          description: string | null;
          icon: string | null;
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
          parameters: Record<string, unknown>;
          is_system: boolean;
          is_active: boolean;
          cost_per_run: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          display_name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
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
          model_provider?: 'openai' | 'anthropic' | 'google' | 'local';
          model?: string;
          system_prompt: string;
          parameters?: Record<string, unknown>;
          is_system?: boolean;
          is_active?: boolean;
          cost_per_run?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          display_name?: string;
          slug?: string;
          description?: string | null;
          icon?: string | null;
          category?:
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
          model_provider?: 'openai' | 'anthropic' | 'google' | 'local';
          model?: string;
          system_prompt?: string;
          parameters?: Record<string, unknown>;
          is_system?: boolean;
          is_active?: boolean;
          cost_per_run?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      agent_assignments: {
        Row: {
          id: string;
          agent_id: string;
          workspace_id: string;
          assigned_by: string;
          position_x: number | null;
          position_y: number | null;
          config_override: Record<string, unknown>;
          status: 'idle' | 'running' | 'paused' | 'error';
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          workspace_id: string;
          assigned_by: string;
          position_x?: number | null;
          position_y?: number | null;
          config_override?: Record<string, unknown>;
          status?: 'idle' | 'running' | 'paused' | 'error';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          agent_id?: string;
          workspace_id?: string;
          assigned_by?: string;
          position_x?: number | null;
          position_y?: number | null;
          config_override?: Record<string, unknown>;
          status?: 'idle' | 'running' | 'paused' | 'error';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_assignments_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_assignments_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      pipelines: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          category:
            | 'grant_factory'
            | 'document_verification'
            | 'osmu_marketing'
            | 'auto_healing'
            | 'custom';
          graph_definition: Record<string, unknown>;
          required_agents: string[];
          required_mcps: string[];
          is_system: boolean;
          is_active: boolean;
          version: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          category:
            | 'grant_factory'
            | 'document_verification'
            | 'osmu_marketing'
            | 'auto_healing'
            | 'custom';
          graph_definition: Record<string, unknown>;
          required_agents?: string[];
          required_mcps?: string[];
          is_system?: boolean;
          is_active?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          category?:
            | 'grant_factory'
            | 'document_verification'
            | 'osmu_marketing'
            | 'auto_healing'
            | 'custom';
          graph_definition?: Record<string, unknown>;
          required_agents?: string[];
          required_mcps?: string[];
          is_system?: boolean;
          is_active?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      pipeline_executions: {
        Row: {
          id: string;
          pipeline_id: string;
          workspace_id: string;
          triggered_by: string;
          status:
            | 'pending'
            | 'running'
            | 'completed'
            | 'failed'
            | 'cancelled'
            | 'paused';
          input_params: Record<string, unknown>;
          output_result: Json | null;
          error_message: string | null;
          total_credits: number;
          started_at: string | null;
          completed_at: string | null;
          duration_ms: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pipeline_id: string;
          workspace_id: string;
          triggered_by: string;
          status?:
            | 'pending'
            | 'running'
            | 'completed'
            | 'failed'
            | 'cancelled'
            | 'paused';
          input_params?: Record<string, unknown>;
          output_result?: Json | null;
          error_message?: string | null;
          total_credits?: number;
          started_at?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pipeline_id?: string;
          workspace_id?: string;
          triggered_by?: string;
          status?:
            | 'pending'
            | 'running'
            | 'completed'
            | 'failed'
            | 'cancelled'
            | 'paused';
          input_params?: Record<string, unknown>;
          output_result?: Json | null;
          error_message?: string | null;
          total_credits?: number;
          started_at?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pipeline_executions_pipeline_id_fkey';
            columns: ['pipeline_id'];
            isOneToOne: false;
            referencedRelation: 'pipelines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pipeline_executions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      pipeline_steps: {
        Row: {
          id: string;
          execution_id: string;
          step_name: string;
          step_order: number;
          agent_id: string | null;
          status:
            | 'pending'
            | 'running'
            | 'completed'
            | 'failed'
            | 'skipped'
            | 'retrying';
          input_data: Json | null;
          output_data: Json | null;
          error_message: string | null;
          credits_used: number;
          retry_count: number;
          max_retries: number;
          started_at: string | null;
          completed_at: string | null;
          duration_ms: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          execution_id: string;
          step_name: string;
          step_order: number;
          agent_id?: string | null;
          status?:
            | 'pending'
            | 'running'
            | 'completed'
            | 'failed'
            | 'skipped'
            | 'retrying';
          input_data?: Json | null;
          output_data?: Json | null;
          error_message?: string | null;
          credits_used?: number;
          retry_count?: number;
          max_retries?: number;
          started_at?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          execution_id?: string;
          step_name?: string;
          step_order?: number;
          agent_id?: string | null;
          status?:
            | 'pending'
            | 'running'
            | 'completed'
            | 'failed'
            | 'skipped'
            | 'retrying';
          input_data?: Json | null;
          output_data?: Json | null;
          error_message?: string | null;
          credits_used?: number;
          retry_count?: number;
          max_retries?: number;
          started_at?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pipeline_steps_execution_id_fkey';
            columns: ['execution_id'];
            isOneToOne: false;
            referencedRelation: 'pipeline_executions';
            referencedColumns: ['id'];
          },
        ];
      };
      mcp_connections: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          slug: string;
          provider:
            | 'firecrawl'
            | 'paddleocr'
            | 'google_drive'
            | 'figma'
            | 'slack'
            | 'custom';
          endpoint_url: string;
          auth_method: 'api_key' | 'oauth2' | 'basic' | 'none';
          secret_ref: string | null;
          config: Record<string, unknown>;
          health_status: 'healthy' | 'degraded' | 'down' | 'unknown';
          last_health_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          slug: string;
          provider:
            | 'firecrawl'
            | 'paddleocr'
            | 'google_drive'
            | 'figma'
            | 'slack'
            | 'custom';
          endpoint_url: string;
          auth_method?: 'api_key' | 'oauth2' | 'basic' | 'none';
          secret_ref?: string | null;
          config?: Record<string, unknown>;
          health_status?: 'healthy' | 'degraded' | 'down' | 'unknown';
          last_health_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          slug?: string;
          provider?:
            | 'firecrawl'
            | 'paddleocr'
            | 'google_drive'
            | 'figma'
            | 'slack'
            | 'custom';
          endpoint_url?: string;
          auth_method?: 'api_key' | 'oauth2' | 'basic' | 'none';
          secret_ref?: string | null;
          config?: Record<string, unknown>;
          health_status?: 'healthy' | 'degraded' | 'down' | 'unknown';
          last_health_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'mcp_connections_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      secret_vault: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          slug: string;
          encrypted_value: string;
          iv: string;
          auth_tag: string;
          key_version: number;
          category:
            | 'api_key'
            | 'oauth_token'
            | 'password'
            | 'certificate'
            | 'webhook_secret'
            | 'other';
          expires_at: string | null;
          last_rotated_at: string | null;
          last_accessed_at: string | null;
          auto_rotation: boolean;
          rotation_interval_days: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          slug: string;
          encrypted_value: string;
          iv: string;
          auth_tag: string;
          key_version?: number;
          category?:
            | 'api_key'
            | 'oauth_token'
            | 'password'
            | 'certificate'
            | 'webhook_secret'
            | 'other';
          expires_at?: string | null;
          last_rotated_at?: string | null;
          last_accessed_at?: string | null;
          auto_rotation?: boolean;
          rotation_interval_days?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          slug?: string;
          encrypted_value?: string;
          iv?: string;
          auth_tag?: string;
          key_version?: number;
          category?:
            | 'api_key'
            | 'oauth_token'
            | 'password'
            | 'certificate'
            | 'webhook_secret'
            | 'other';
          expires_at?: string | null;
          last_rotated_at?: string | null;
          last_accessed_at?: string | null;
          auto_rotation?: boolean;
          rotation_interval_days?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'secret_vault_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      credits: {
        Row: {
          id: string;
          workspace_id: string;
          transaction_type:
            | 'charge'
            | 'usage'
            | 'refund'
            | 'bonus'
            | 'adjustment';
          amount: number;
          balance_after: number;
          description: string | null;
          reference_type: string | null;
          reference_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          transaction_type:
            | 'charge'
            | 'usage'
            | 'refund'
            | 'bonus'
            | 'adjustment';
          amount: number;
          balance_after: number;
          description?: string | null;
          reference_type?: string | null;
          reference_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          transaction_type?:
            | 'charge'
            | 'usage'
            | 'refund'
            | 'bonus'
            | 'adjustment';
          amount?: number;
          balance_after?: number;
          description?: string | null;
          reference_type?: string | null;
          reference_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credits_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      business_plans: {
        Row: {
          id: string;
          workspace_id: string;
          title: string;
          industry: string;
          target_market: string;
          status: 'draft' | 'generating' | 'completed' | 'exported';
          company_name: string;
          company_description: string;
          tam_value: number;
          sam_value: number;
          som_value: number;
          competitors: Record<string, unknown>[];
          sections: Record<string, unknown>;
          generated_at: string | null;
          exported_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          title: string;
          industry: string;
          target_market: string;
          status?: 'draft' | 'generating' | 'completed' | 'exported';
          company_name: string;
          company_description?: string;
          tam_value?: number;
          sam_value?: number;
          som_value?: number;
          competitors?: Record<string, unknown>[];
          sections?: Record<string, unknown>;
          generated_at?: string | null;
          exported_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          title?: string;
          industry?: string;
          target_market?: string;
          status?: 'draft' | 'generating' | 'completed' | 'exported';
          company_name?: string;
          company_description?: string;
          tam_value?: number;
          sam_value?: number;
          som_value?: number;
          competitors?: Record<string, unknown>[];
          sections?: Record<string, unknown>;
          generated_at?: string | null;
          exported_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'business_plans_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      tender_submissions: {
        Row: {
          id: string;
          workspace_id: string;
          pipeline_execution_id: string | null;
          tender_id: string;
          tender_title: string;
          tender_url: string | null;
          organization: string | null;
          status:
            | 'draft'
            | 'crawled'
            | 'eligible'
            | 'reviewing'
            | 'docs_ready'
            | 'submitted'
            | 'won'
            | 'lost';
          bid_amount: number | null;
          deadline: string | null;
          documents: Record<string, unknown>[];
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          pipeline_execution_id?: string | null;
          tender_id: string;
          tender_title: string;
          tender_url?: string | null;
          organization?: string | null;
          status?:
            | 'draft'
            | 'crawled'
            | 'eligible'
            | 'reviewing'
            | 'docs_ready'
            | 'submitted'
            | 'won'
            | 'lost';
          bid_amount?: number | null;
          deadline?: string | null;
          documents?: Record<string, unknown>[];
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          pipeline_execution_id?: string | null;
          tender_id?: string;
          tender_title?: string;
          tender_url?: string | null;
          organization?: string | null;
          status?:
            | 'draft'
            | 'crawled'
            | 'eligible'
            | 'reviewing'
            | 'docs_ready'
            | 'submitted'
            | 'won'
            | 'lost';
          bid_amount?: number | null;
          deadline?: string | null;
          documents?: Record<string, unknown>[];
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tender_submissions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tender_submissions_pipeline_execution_id_fkey';
            columns: ['pipeline_execution_id'];
            isOneToOne: false;
            referencedRelation: 'pipeline_executions';
            referencedColumns: ['id'];
          },
        ];
      };
      document_reviews: {
        Row: {
          id: string;
          workspace_id: string;
          pipeline_execution_id: string | null;
          document_name: string;
          document_type: string;
          file_url: string | null;
          status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'archived';
          issues: Record<string, unknown>[];
          reviewer_notes: string | null;
          gdrive_file_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          pipeline_execution_id?: string | null;
          document_name: string;
          document_type?: string;
          file_url?: string | null;
          status?: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'archived';
          issues?: Record<string, unknown>[];
          reviewer_notes?: string | null;
          gdrive_file_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          pipeline_execution_id?: string | null;
          document_name?: string;
          document_type?: string;
          file_url?: string | null;
          status?: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'archived';
          issues?: Record<string, unknown>[];
          reviewer_notes?: string | null;
          gdrive_file_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_reviews_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_reviews_pipeline_execution_id_fkey';
            columns: ['pipeline_execution_id'];
            isOneToOne: false;
            referencedRelation: 'pipeline_executions';
            referencedColumns: ['id'];
          },
        ];
      };
      healing_incidents: {
        Row: {
          id: string;
          workspace_id: string;
          pipeline_execution_id: string | null;
          incident_type:
            | 'api_failure'
            | 'crawl_blocked'
            | 'rate_limited'
            | 'timeout'
            | 'auth_expired';
          source_service: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
          status:
            | 'detected'
            | 'diagnosing'
            | 'healing'
            | 'resolved'
            | 'escalated';
          resolution_action: string | null;
          resolution_details: Record<string, unknown>;
          detected_at: string;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          pipeline_execution_id?: string | null;
          incident_type:
            | 'api_failure'
            | 'crawl_blocked'
            | 'rate_limited'
            | 'timeout'
            | 'auth_expired';
          source_service: string;
          severity?: 'low' | 'medium' | 'high' | 'critical';
          status?:
            | 'detected'
            | 'diagnosing'
            | 'healing'
            | 'resolved'
            | 'escalated';
          resolution_action?: string | null;
          resolution_details?: Record<string, unknown>;
          detected_at?: string;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          pipeline_execution_id?: string | null;
          incident_type?:
            | 'api_failure'
            | 'crawl_blocked'
            | 'rate_limited'
            | 'timeout'
            | 'auth_expired';
          source_service?: string;
          severity?: 'low' | 'medium' | 'high' | 'critical';
          status?:
            | 'detected'
            | 'diagnosing'
            | 'healing'
            | 'resolved'
            | 'escalated';
          resolution_action?: string | null;
          resolution_details?: Record<string, unknown>;
          detected_at?: string;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'healing_incidents_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healing_incidents_pipeline_execution_id_fkey';
            columns: ['pipeline_execution_id'];
            isOneToOne: false;
            referencedRelation: 'pipeline_executions';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_plans: {
        Row: {
          id: string;
          name: string;
          slug: string;
          credits_per_month: number;
          price_usd: number;
          features: Json;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          credits_per_month?: number;
          price_usd?: number;
          features?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          credits_per_month?: number;
          price_usd?: number;
          features?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      workspace_subscriptions: {
        Row: {
          id: string;
          workspace_id: string;
          plan_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          status: 'active' | 'cancelled' | 'past_due' | 'trialing';
          current_period_start: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          plan_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing';
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          plan_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing';
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_subscriptions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_subscriptions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      budget_alerts: {
        Row: {
          id: string;
          workspace_id: string;
          threshold_percent: number;
          alert_type: 'email' | 'slack' | 'both';
          is_enabled: boolean;
          last_triggered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          threshold_percent?: number;
          alert_type?: 'email' | 'slack' | 'both';
          is_enabled?: boolean;
          last_triggered_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          threshold_percent?: number;
          alert_type?: 'email' | 'slack' | 'both';
          is_enabled?: boolean;
          last_triggered_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budget_alerts_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      persona_debates: {
        Row: {
          id: string;
          workspace_id: string;
          pipeline_execution_id: string | null;
          topic: string;
          status: 'active' | 'concluded';
          summary: string | null;
          conclusion: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          pipeline_execution_id?: string | null;
          topic: string;
          status?: 'active' | 'concluded';
          summary?: string | null;
          conclusion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          pipeline_execution_id?: string | null;
          topic?: string;
          status?: 'active' | 'concluded';
          summary?: string | null;
          conclusion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'persona_debates_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'persona_debates_pipeline_execution_id_fkey';
            columns: ['pipeline_execution_id'];
            isOneToOne: false;
            referencedRelation: 'pipeline_executions';
            referencedColumns: ['id'];
          },
        ];
      };
      debate_messages: {
        Row: {
          id: string;
          debate_id: string;
          agent_id: string;
          agent_role: 'optimist' | 'pessimist' | 'realist' | 'critic';
          message_content: string;
          reasoning: string | null;
          confidence_score: number;
          sequence_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          debate_id: string;
          agent_id: string;
          agent_role: 'optimist' | 'pessimist' | 'realist' | 'critic';
          message_content: string;
          reasoning?: string | null;
          confidence_score?: number;
          sequence_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          debate_id?: string;
          agent_id?: string;
          agent_role?: 'optimist' | 'pessimist' | 'realist' | 'critic';
          message_content?: string;
          reasoning?: string | null;
          confidence_score?: number;
          sequence_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'debate_messages_debate_id_fkey';
            columns: ['debate_id'];
            isOneToOne: false;
            referencedRelation: 'persona_debates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'debate_messages_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_metrics: {
        Row: {
          id: string;
          agent_id: string;
          workspace_id: string;
          metric_type:
            | 'success_rate'
            | 'avg_response_time'
            | 'cost_efficiency'
            | 'quality_score';
          metric_value: number;
          period_start: string;
          period_end: string;
          sample_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          workspace_id: string;
          metric_type:
            | 'success_rate'
            | 'avg_response_time'
            | 'cost_efficiency'
            | 'quality_score';
          metric_value?: number;
          period_start: string;
          period_end: string;
          sample_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          workspace_id?: string;
          metric_type?:
            | 'success_rate'
            | 'avg_response_time'
            | 'cost_efficiency'
            | 'quality_score';
          metric_value?: number;
          period_start?: string;
          period_end?: string;
          sample_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_metrics_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_metrics_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_limits: {
        Row: {
          id: string;
          workspace_id: string;
          monthly_limit: number;
          auto_stop: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          monthly_limit?: number;
          auto_stop?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          monthly_limit?: number;
          auto_stop?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_limits_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_limits_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          workspace_id: string | null;
          user_id: string | null;
          agent_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Record<string, unknown>;
          ip_address: string | null;
          user_agent: string | null;
          severity: 'info' | 'warning' | 'error' | 'critical';
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id?: string | null;
          user_id?: string | null;
          agent_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          details?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          severity?: 'info' | 'warning' | 'error' | 'critical';
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string | null;
          user_id?: string | null;
          agent_id?: string | null;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          details?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          severity?: 'info' | 'warning' | 'error' | 'critical';
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
