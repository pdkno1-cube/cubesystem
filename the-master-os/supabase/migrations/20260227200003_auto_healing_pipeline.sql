-- =============================================================================
-- Migration: Auto-Healing Pipeline + healing_incidents table
-- The Master OS — F-04d: Auto-Healing Pipeline
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. INSERT auto-healing pipeline definition (7 nodes)
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
    '30000000-0000-0000-0000-000000000006',
    'Auto-Healing Pipeline',
    'auto-healing-pipeline',
    '시스템 장애 자동 감지 → 진단 → API 키 로테이션 / 프록시 전환 / 핫픽스 → 복구 검증 → 보고 파이프라인',
    'auto_healing',
    '{
        "nodes": [
            {"id": "detect_failure",    "type": "trigger",      "label": "장애 감지 (Health Check)"},
            {"id": "diagnose",          "type": "agent_call",   "label": "원인 진단 (COOAgent)"},
            {"id": "rotate_api_key",    "type": "action",       "label": "API 키 로테이션"},
            {"id": "switch_proxy",      "type": "action",       "label": "프록시 전환"},
            {"id": "apply_hotfix",      "type": "action",       "label": "핫픽스 적용"},
            {"id": "verify_recovery",   "type": "validation",   "label": "복구 검증"},
            {"id": "send_report",       "type": "output",       "label": "결과 보고 (Slack)"}
        ],
        "edges": [
            {"from": "detect_failure",  "to": "diagnose"},
            {"from": "diagnose",        "to": "rotate_api_key"},
            {"from": "diagnose",        "to": "switch_proxy"},
            {"from": "diagnose",        "to": "apply_hotfix"},
            {"from": "rotate_api_key",  "to": "verify_recovery"},
            {"from": "switch_proxy",    "to": "verify_recovery"},
            {"from": "apply_hotfix",    "to": "verify_recovery"},
            {"from": "verify_recovery", "to": "send_report"}
        ],
        "entry_point": "detect_failure"
    }'::jsonb,
    '["coo-agent", "critic-agent"]'::jsonb,
    '["slack"]'::jsonb,
    true,
    true,
    1
) ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Table: healing_incidents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS healing_incidents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            UUID NOT NULL REFERENCES workspaces(id),
    pipeline_execution_id   UUID REFERENCES pipeline_executions(id),
    incident_type           TEXT NOT NULL
                            CHECK (incident_type IN (
                                'api_failure', 'crawl_blocked', 'rate_limited',
                                'timeout', 'auth_expired'
                            )),
    source_service          TEXT NOT NULL,
    severity                TEXT NOT NULL DEFAULT 'medium'
                            CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status                  TEXT NOT NULL DEFAULT 'detected'
                            CHECK (status IN (
                                'detected', 'diagnosing', 'healing',
                                'resolved', 'escalated'
                            )),
    resolution_action       TEXT,
    resolution_details      JSONB DEFAULT '{}'::jsonb,
    detected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hi_workspace ON healing_incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_hi_status ON healing_incidents(status)
    WHERE status IN ('detected', 'diagnosing', 'healing');
CREATE INDEX IF NOT EXISTS idx_hi_severity ON healing_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_hi_workspace_detected ON healing_incidents(workspace_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_hi_type ON healing_incidents(incident_type);

-- RLS
ALTER TABLE healing_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY healing_incidents_workspace_access ON healing_incidents
    FOR ALL
    USING (
        workspace_id IN (
            SELECT wm.workspace_id
            FROM workspace_members wm
            WHERE wm.user_id = auth.uid()
        )
    );
