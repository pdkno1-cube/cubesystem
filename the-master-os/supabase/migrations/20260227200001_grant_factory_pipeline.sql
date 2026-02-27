-- =============================================================================
-- Migration: Grant Factory Pipeline + tender_submissions table
-- The Master OS — 조달입찰 자동화 파이프라인 (F-04a)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. INSERT grant-factory pipeline (idempotent: ON CONFLICT DO NOTHING)
-- -----------------------------------------------------------------------------
INSERT INTO pipelines (
    id,
    name,
    slug,
    description,
    category,
    graph_definition,
    required_agents,
    required_mcps,
    is_system_default,
    is_active,
    version
) VALUES (
    '30000000-0000-0000-0000-000000000001',
    'Grant Factory',
    'grant-factory',
    '나라장터/G2B 조달입찰 공고 자동 탐색 → 적격 검증 → 입찰 서류 준비 자동화 파이프라인 (8단계)',
    'grant_factory',
    '{
        "nodes": [
            {"id": "crawl_tenders",   "type": "mcp_call",       "label": "공고 크롤링 (FireCrawl)"},
            {"id": "filter_eligible", "type": "agent_call",     "label": "적격 필터링 (OptimistAgent)"},
            {"id": "rag_match",       "type": "agent_call",     "label": "RAG 매칭 (AnalyticsAgent)"},
            {"id": "persona_debate",  "type": "agent_call",     "label": "페르소나 토론 (Optimist+Critic+Realist)"},
            {"id": "generate_docs",   "type": "agent_call",     "label": "입찰 서류 생성 (BlogAgent)"},
            {"id": "ocr_verify",      "type": "mcp_call",       "label": "OCR 서류 검증 (PaddleOCR)"},
            {"id": "final_review",    "type": "agent_call",     "label": "최종 검토 (CriticAgent)"},
            {"id": "submit_notify",   "type": "output",         "label": "제출 알림 (Slack)"}
        ],
        "edges": [
            {"from": "crawl_tenders",   "to": "filter_eligible"},
            {"from": "filter_eligible", "to": "rag_match"},
            {"from": "rag_match",       "to": "persona_debate"},
            {"from": "persona_debate",  "to": "generate_docs"},
            {"from": "generate_docs",   "to": "ocr_verify"},
            {"from": "ocr_verify",      "to": "final_review"},
            {"from": "final_review",    "to": "submit_notify"}
        ],
        "entry_point": "crawl_tenders"
    }'::jsonb,
    '["optimist-agent", "critic-agent", "realist-agent", "blog-agent", "analytics-agent"]'::jsonb,
    '["firecrawl", "paddleocr", "slack"]'::jsonb,
    true,
    true,
    2
) ON CONFLICT (id) DO UPDATE SET
    description      = EXCLUDED.description,
    graph_definition = EXCLUDED.graph_definition,
    required_agents  = EXCLUDED.required_agents,
    required_mcps    = EXCLUDED.required_mcps,
    version          = EXCLUDED.version,
    updated_at       = now();

-- -----------------------------------------------------------------------------
-- 2. CREATE tender_submissions table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tender_submissions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id           UUID NOT NULL REFERENCES workspaces(id),
    pipeline_execution_id  UUID REFERENCES pipeline_executions(id),
    tender_id              TEXT NOT NULL,
    tender_title           TEXT NOT NULL,
    tender_url             TEXT,
    organization           TEXT,
    status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN (
                               'draft', 'crawled', 'eligible', 'reviewing',
                               'docs_ready', 'submitted', 'won', 'lost'
                           )),
    bid_amount             DECIMAL(15,2),
    deadline               TIMESTAMPTZ,
    documents              JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ts_workspace
    ON tender_submissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ts_status
    ON tender_submissions(status);
CREATE INDEX IF NOT EXISTS idx_ts_deadline
    ON tender_submissions(deadline)
    WHERE status NOT IN ('won', 'lost');
CREATE INDEX IF NOT EXISTS idx_ts_workspace_created
    ON tender_submissions(workspace_id, created_at DESC);

-- Auto-update updated_at (idempotent: DROP IF EXISTS first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_tender_submissions_updated_at'
    ) THEN
        CREATE TRIGGER trg_tender_submissions_updated_at
            BEFORE UPDATE ON tender_submissions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. RLS policies for tender_submissions
-- -----------------------------------------------------------------------------
ALTER TABLE tender_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tender_submissions'
          AND policyname = 'tender_submissions_select_own_workspace'
    ) THEN
        CREATE POLICY tender_submissions_select_own_workspace
            ON tender_submissions FOR SELECT
            USING (
                workspace_id IN (
                    SELECT wm.workspace_id FROM workspace_members wm
                    WHERE wm.user_id = auth.uid()
                      AND wm.deleted_at IS NULL
                )
            );
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tender_submissions'
          AND policyname = 'tender_submissions_insert_own_workspace'
    ) THEN
        CREATE POLICY tender_submissions_insert_own_workspace
            ON tender_submissions FOR INSERT
            WITH CHECK (
                workspace_id IN (
                    SELECT wm.workspace_id FROM workspace_members wm
                    WHERE wm.user_id = auth.uid()
                      AND wm.deleted_at IS NULL
                )
            );
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tender_submissions'
          AND policyname = 'tender_submissions_update_own_workspace'
    ) THEN
        CREATE POLICY tender_submissions_update_own_workspace
            ON tender_submissions FOR UPDATE
            USING (
                workspace_id IN (
                    SELECT wm.workspace_id FROM workspace_members wm
                    WHERE wm.user_id = auth.uid()
                      AND wm.deleted_at IS NULL
                )
            );
    END IF;
END;
$$;
