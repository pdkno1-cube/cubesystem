-- =============================================================================
-- Migration: Document Validation Pipeline + document_reviews table
-- The Master OS — F-04b Document Validation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add 'document_validation' category to pipelines (already exists in CHECK)
--    Insert document-validation pipeline definition (8 nodes)
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
)
VALUES (
    '30000000-0000-0000-0000-000000000005',
    'Document Validation',
    'document-validation',
    '문서 업로드 → 텍스트 추출 → 형식 검증 → 컴플라이언스 검사 → 데이터 검증 → 분류 → 아카이브 → 알림 자동화 파이프라인',
    'document_verification',
    '{
      "nodes": [
        {"id": "upload", "type": "trigger", "label": "문서 업로드"},
        {"id": "extract_text", "type": "mcp_call", "label": "텍스트 추출 (OCR/PDF Parser)"},
        {"id": "format_check", "type": "validation", "label": "형식 검증 (포맷/용량/필드)"},
        {"id": "compliance_check", "type": "agent_call", "label": "컴플라이언스 검사 (CriticAgent)"},
        {"id": "data_verify", "type": "agent_call", "label": "데이터 검증 (OCRAgent + CriticAgent)"},
        {"id": "classify", "type": "agent_call", "label": "문서 분류 (TopicAnalystAgent)"},
        {"id": "archive", "type": "mcp_call", "label": "아카이브 (Google Drive 저장)"},
        {"id": "notify", "type": "output", "label": "검증 완료 알림 (Slack)"}
      ],
      "edges": [
        {"from": "upload", "to": "extract_text"},
        {"from": "extract_text", "to": "format_check"},
        {"from": "format_check", "to": "compliance_check"},
        {"from": "compliance_check", "to": "data_verify"},
        {"from": "data_verify", "to": "classify"},
        {"from": "classify", "to": "archive"},
        {"from": "archive", "to": "notify"}
      ],
      "entry_point": "upload"
    }'::jsonb,
    '["ocr-agent", "critic-agent", "topic-analyst-agent"]'::jsonb,
    '["paddleocr", "google_drive", "slack"]'::jsonb,
    true,
    true,
    1
)
ON CONFLICT (slug) WHERE deleted_at IS NULL
DO UPDATE SET
    description = EXCLUDED.description,
    graph_definition = EXCLUDED.graph_definition,
    required_agents = EXCLUDED.required_agents,
    required_mcps = EXCLUDED.required_mcps,
    updated_at = now();


-- -----------------------------------------------------------------------------
-- 2. Create document_reviews table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_reviews (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            UUID NOT NULL REFERENCES workspaces(id),
    pipeline_execution_id   UUID REFERENCES pipeline_executions(id),
    document_name           TEXT NOT NULL,
    document_type           TEXT NOT NULL DEFAULT 'general',
    file_url                TEXT,
    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                                'pending', 'reviewing', 'approved',
                                'rejected', 'archived'
                            )),
    issues                  JSONB NOT NULL DEFAULT '[]'::jsonb,
    reviewer_notes          TEXT,
    gdrive_file_id          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_reviews_workspace
    ON document_reviews(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_reviews_status
    ON document_reviews(status)
    WHERE status IN ('pending', 'reviewing');
CREATE INDEX IF NOT EXISTS idx_document_reviews_workspace_created
    ON document_reviews(workspace_id, created_at DESC);

-- Auto-update updated_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_document_reviews_updated_at'
    ) THEN
        CREATE TRIGGER trg_document_reviews_updated_at
            BEFORE UPDATE ON document_reviews
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

-- RLS
ALTER TABLE document_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_reviews_workspace_read ON document_reviews
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY document_reviews_workspace_insert ON document_reviews
    FOR INSERT WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY document_reviews_workspace_update ON document_reviews
    FOR UPDATE USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid()
        )
    );
