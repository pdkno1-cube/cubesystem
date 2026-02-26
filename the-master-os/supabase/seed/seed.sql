-- =============================================================================
-- Seed Data: The Master OS
-- Test/Development seed data
-- =============================================================================
-- NOTE: This seed file assumes Supabase Auth has already created
-- the user in auth.users. The UUIDs below are deterministic for dev.
-- In production, users are created via Supabase Auth (MFA required).
-- =============================================================================

-- =============================================================================
-- 1. Users (Chairman / System Admin)
-- =============================================================================
-- Use deterministic UUIDs for reproducible dev environment
INSERT INTO users (id, email, full_name, role, is_active) VALUES
    ('00000000-0000-0000-0000-000000000001', 'chairman@cubesystem.co.kr', '회장', 'owner', true)
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- 2. Workspaces
-- =============================================================================
INSERT INTO workspaces (id, owner_id, name, slug, description, category, icon, status, settings) VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        '엉클로지텍',
        'uncle-logitech',
        '엉클로지텍 법인 워크스페이스 - 정부조달 및 물류 사업',
        'corporation',
        '🏢',
        'active',
        '{"timezone": "Asia/Seoul", "language": "ko", "max_agents": 50}'::jsonb
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'Cube System',
        'cube-system',
        'Cube System 법인 워크스페이스 - IT 솔루션 및 AI 서비스',
        'corporation',
        '🧊',
        'active',
        '{"timezone": "Asia/Seoul", "language": "ko", "max_agents": 100}'::jsonb
    )
ON CONFLICT (slug) DO NOTHING;

-- NOTE: workspace_members for owner are auto-inserted by trg_workspace_auto_owner trigger

-- =============================================================================
-- 3. Agents (6 default agents, one per representative category)
-- =============================================================================
INSERT INTO agents (id, name, display_name, slug, description, icon, category, role_description, model_provider, model, system_prompt, capabilities, config, parameters, is_system, is_active, cost_per_run, status, created_by) VALUES
    -- OptimistAgent (planning)
    (
        '20000000-0000-0000-0000-000000000001',
        'OptimistAgent',
        '낙관론자',
        'optimist-agent',
        '프로젝트와 제안의 긍정적 측면, 기회, 성장 가능성을 분석하는 에이전트',
        '😊',
        'planning',
        '낙관론자 페르소나로 사업 기회와 긍정적 전망을 분석합니다',
        'openai',
        'gpt-4o',
        '당신은 낙관론자 에이전트입니다. 모든 프로젝트와 제안을 긍정적 관점에서 분석하세요. 기회 요소, 성장 가능성, 시너지 효과를 중점적으로 평가하되, 근거 없는 낙관은 피하고 데이터에 기반한 긍정적 분석을 제공하세요. 항상 한국어로 응답합니다.',
        '["opportunity_analysis", "growth_forecasting", "synergy_evaluation"]'::jsonb,
        '{"max_context_length": 128000}'::jsonb,
        '{"temperature": 0.7, "max_tokens": 4096, "top_p": 1.0}'::jsonb,
        true, true, 0.05, 'active',
        '00000000-0000-0000-0000-000000000001'
    ),
    -- CriticAgent (audit)
    (
        '20000000-0000-0000-0000-000000000002',
        'CriticAgent',
        '비관론자',
        'critic-agent',
        '리스크, 약점, 잠재적 실패 요인을 비판적으로 분석하는 에이전트',
        '🧐',
        'audit',
        '비관론자 페르소나로 리스크와 약점을 분석합니다',
        'anthropic',
        'claude-sonnet-4-20250514',
        '당신은 비관론자 에이전트입니다. 모든 프로젝트와 제안을 비판적 관점에서 분석하세요. 숨겨진 리스크, 잠재적 실패 요인, 비용 초과 가능성, 경쟁 위협을 집중적으로 평가하세요. 단순한 비관이 아닌 건설적 비판을 제공하고, 각 리스크에 대한 완화 방안도 제시하세요. 항상 한국어로 응답합니다.',
        '["risk_analysis", "vulnerability_assessment", "cost_overrun_detection"]'::jsonb,
        '{"max_context_length": 200000}'::jsonb,
        '{"temperature": 0.3, "max_tokens": 4096, "top_p": 0.9}'::jsonb,
        true, true, 0.08, 'active',
        '00000000-0000-0000-0000-000000000001'
    ),
    -- RealistAgent (analytics)
    (
        '20000000-0000-0000-0000-000000000003',
        'RealistAgent',
        '현실주의자',
        'realist-agent',
        '데이터 기반으로 객관적 현실을 분석하고 균형 잡힌 판단을 제공하는 에이전트',
        '📊',
        'analytics',
        '현실주의자 페르소나로 데이터 기반 균형 잡힌 분석을 제공합니다',
        'openai',
        'gpt-4o',
        '당신은 현실주의자 에이전트입니다. 낙관론자와 비관론자의 분석을 종합하여 데이터에 기반한 균형 잡힌 최종 판단을 제공하세요. 실현 가능성, ROI, 우선순위를 정량적으로 평가하고, 구체적인 실행 계획과 마일스톤을 제안하세요. 항상 한국어로 응답합니다.',
        '["data_synthesis", "roi_calculation", "prioritization", "milestone_planning"]'::jsonb,
        '{"max_context_length": 128000}'::jsonb,
        '{"temperature": 0.5, "max_tokens": 8192, "top_p": 0.95}'::jsonb,
        true, true, 0.05, 'active',
        '00000000-0000-0000-0000-000000000001'
    ),
    -- BlogAgent (writing)
    (
        '20000000-0000-0000-0000-000000000004',
        'BlogAgent',
        '블로그 작가',
        'blog-agent',
        'SEO 최적화된 블로그 콘텐츠를 생성하는 마케팅 에이전트',
        '✍️',
        'writing',
        'SEO 블로그 콘텐츠 생성 전문 에이전트',
        'anthropic',
        'claude-sonnet-4-20250514',
        '당신은 전문 블로그 작가 에이전트입니다. SEO 최적화된 블로그 포스트를 작성하세요. 키워드 분석, 제목 최적화, 메타 디스크립션, 내부 링크 전략을 포함합니다. B2B/B2G 마케팅에 특화되어 있으며, 정부조달, IT 솔루션, 물류 분야의 전문 용어를 자연스럽게 활용합니다. 항상 한국어로 응답합니다.',
        '["seo_optimization", "content_generation", "keyword_analysis", "meta_description"]'::jsonb,
        '{"max_context_length": 200000}'::jsonb,
        '{"temperature": 0.8, "max_tokens": 8192, "top_p": 1.0}'::jsonb,
        true, true, 0.06, 'active',
        '00000000-0000-0000-0000-000000000001'
    ),
    -- OCRAgent (ocr)
    (
        '20000000-0000-0000-0000-000000000005',
        'OCRAgent',
        'OCR 판독기',
        'ocr-agent',
        '사업자등록증, 입찰서류 등을 판독하고 구조화하는 에이전트',
        '🔍',
        'ocr',
        '서류 판독 및 데이터 구조화 전문 에이전트',
        'openai',
        'gpt-4o',
        '당신은 OCR 판독 에이전트입니다. PaddleOCR로 추출된 텍스트를 분석하여 구조화된 데이터로 변환하세요. 사업자등록증(사업자번호, 대표자명, 업태, 종목), 입찰서류(공고번호, 입찰금액, 납품기한), 세금계산서(공급자, 공급받는자, 금액) 등을 정확하게 파싱합니다. 불확실한 데이터에는 confidence score를 포함하세요. 항상 한국어로 응답합니다.',
        '["document_parsing", "data_structuring", "confidence_scoring", "field_extraction"]'::jsonb,
        '{"max_context_length": 128000, "requires_mcp": ["paddleocr"]}'::jsonb,
        '{"temperature": 0.1, "max_tokens": 4096, "top_p": 0.9}'::jsonb,
        true, true, 0.03, 'active',
        '00000000-0000-0000-0000-000000000001'
    ),
    -- COOAgent (devops)
    (
        '20000000-0000-0000-0000-000000000006',
        'COOAgent',
        'COO 에이전트',
        'coo-agent',
        '시스템 운영, 모니터링, 자동 복구를 담당하는 DevOps 에이전트',
        '🛠️',
        'devops',
        '시스템 운영 및 자동 복구 전문 에이전트',
        'openai',
        'gpt-4o',
        '당신은 COO(Chief Operating Officer) 에이전트입니다. 시스템 운영 상태를 모니터링하고, 장애 발생 시 원인을 분석하여 복구 방안을 제시합니다. API 키 만료, 서비스 다운타임, 리소스 부족 등의 이슈에 대해 대응 방안을 수립하되, 핫픽스 자동 배포는 절대 수행하지 않고 반드시 회장 승인을 요청합니다. 항상 한국어로 응답합니다.',
        '["system_monitoring", "incident_analysis", "recovery_planning", "resource_management"]'::jsonb,
        '{"max_context_length": 128000, "auto_deploy_forbidden": true}'::jsonb,
        '{"temperature": 0.2, "max_tokens": 4096, "top_p": 0.9}'::jsonb,
        true, true, 0.04, 'active',
        '00000000-0000-0000-0000-000000000001'
    )
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 4. Pipelines (4 default pipelines)
-- =============================================================================
INSERT INTO pipelines (id, name, slug, description, category, graph_definition, required_agents, required_mcps, default_config, is_system_default, is_active, version, created_by) VALUES
    -- Grant Factory
    (
        '30000000-0000-0000-0000-000000000001',
        'Grant Factory',
        'grant-factory',
        '정부조달 공고 수집 -> 적합성 분석 -> 입찰서류 생성 자동화 파이프라인',
        'grant_factory',
        '{
            "nodes": [
                {"id": "validate_input", "type": "validation", "label": "입력 검증"},
                {"id": "crawl_announcements", "type": "mcp_call", "label": "공고 수집 (FireCrawl)"},
                {"id": "analyze_eligibility", "type": "agent_call", "label": "적합성 분석 (OptimistAgent + CriticAgent)"},
                {"id": "generate_documents", "type": "agent_call", "label": "서류 생성 (BlogAgent)"},
                {"id": "review_documents", "type": "agent_call", "label": "서류 검토 (RealistAgent)"},
                {"id": "finalize", "type": "output", "label": "최종 결과 저장"}
            ],
            "edges": [
                {"from": "validate_input", "to": "crawl_announcements"},
                {"from": "crawl_announcements", "to": "analyze_eligibility"},
                {"from": "analyze_eligibility", "to": "generate_documents"},
                {"from": "generate_documents", "to": "review_documents"},
                {"from": "review_documents", "to": "finalize"}
            ],
            "entry_point": "validate_input"
        }'::jsonb,
        '["optimist-agent", "critic-agent", "realist-agent", "blog-agent"]'::jsonb,
        '["firecrawl"]'::jsonb,
        '{"max_announcements": 50, "eligibility_threshold": 0.7}'::jsonb,
        true, true, 1,
        '00000000-0000-0000-0000-000000000001'
    ),
    -- Document Verification
    (
        '30000000-0000-0000-0000-000000000002',
        'Document Verification',
        'document-verification',
        '사업자등록증, 입찰서류, 세금계산서 등 서류 자동 판독 및 검증 파이프라인',
        'document_verification',
        '{
            "nodes": [
                {"id": "validate_input", "type": "validation", "label": "입력 검증"},
                {"id": "ocr_extract", "type": "mcp_call", "label": "OCR 텍스트 추출 (PaddleOCR)"},
                {"id": "structure_data", "type": "agent_call", "label": "데이터 구조화 (OCRAgent)"},
                {"id": "verify_data", "type": "agent_call", "label": "데이터 검증 (CriticAgent)"},
                {"id": "store_result", "type": "output", "label": "결과 저장 (Google Drive)"}
            ],
            "edges": [
                {"from": "validate_input", "to": "ocr_extract"},
                {"from": "ocr_extract", "to": "structure_data"},
                {"from": "structure_data", "to": "verify_data"},
                {"from": "verify_data", "to": "store_result"}
            ],
            "entry_point": "validate_input"
        }'::jsonb,
        '["ocr-agent", "critic-agent"]'::jsonb,
        '["paddleocr", "google_drive"]'::jsonb,
        '{"supported_formats": ["pdf", "jpg", "png"], "confidence_threshold": 0.85}'::jsonb,
        true, true, 1,
        '00000000-0000-0000-0000-000000000001'
    ),
    -- OSMU Marketing
    (
        '30000000-0000-0000-0000-000000000003',
        'OSMU Marketing',
        'osmu-marketing',
        'One Source Multi Use 마케팅 콘텐츠 자동 생성 파이프라인 (블로그, SNS, 보고서)',
        'osmu_marketing',
        '{
            "nodes": [
                {"id": "validate_input", "type": "validation", "label": "입력 검증"},
                {"id": "analyze_topic", "type": "agent_call", "label": "주제 분석 (RealistAgent)"},
                {"id": "generate_blog", "type": "agent_call", "label": "블로그 생성 (BlogAgent)"},
                {"id": "generate_sns", "type": "agent_call", "label": "SNS 콘텐츠 생성 (BlogAgent)"},
                {"id": "generate_report", "type": "agent_call", "label": "보고서 생성 (RealistAgent)"},
                {"id": "review_all", "type": "agent_call", "label": "전체 검토 (CriticAgent)"},
                {"id": "finalize", "type": "output", "label": "결과 저장 및 배포"}
            ],
            "edges": [
                {"from": "validate_input", "to": "analyze_topic"},
                {"from": "analyze_topic", "to": "generate_blog"},
                {"from": "analyze_topic", "to": "generate_sns"},
                {"from": "analyze_topic", "to": "generate_report"},
                {"from": "generate_blog", "to": "review_all"},
                {"from": "generate_sns", "to": "review_all"},
                {"from": "generate_report", "to": "review_all"},
                {"from": "review_all", "to": "finalize"}
            ],
            "entry_point": "validate_input"
        }'::jsonb,
        '["realist-agent", "blog-agent", "critic-agent"]'::jsonb,
        '["google_drive", "figma"]'::jsonb,
        '{"output_formats": ["blog", "sns_instagram", "sns_linkedin", "pdf_report"]}'::jsonb,
        true, true, 1,
        '00000000-0000-0000-0000-000000000001'
    ),
    -- Auto-Healing
    (
        '30000000-0000-0000-0000-000000000004',
        'Auto-Healing',
        'auto-healing',
        '시스템 장애 감지, 원인 분석, 복구 방안 수립 자동화 파이프라인 (자동 배포 금지)',
        'auto_healing',
        '{
            "nodes": [
                {"id": "detect_issue", "type": "trigger", "label": "장애 감지"},
                {"id": "diagnose", "type": "agent_call", "label": "원인 분석 (COOAgent)"},
                {"id": "plan_recovery", "type": "agent_call", "label": "복구 계획 수립 (COOAgent)"},
                {"id": "review_plan", "type": "agent_call", "label": "복구 계획 검토 (CriticAgent)"},
                {"id": "await_approval", "type": "human_gate", "label": "회장 승인 대기"},
                {"id": "execute_recovery", "type": "action", "label": "복구 실행"},
                {"id": "verify_recovery", "type": "validation", "label": "복구 검증"},
                {"id": "notify", "type": "output", "label": "결과 알림 (Slack)"}
            ],
            "edges": [
                {"from": "detect_issue", "to": "diagnose"},
                {"from": "diagnose", "to": "plan_recovery"},
                {"from": "plan_recovery", "to": "review_plan"},
                {"from": "review_plan", "to": "await_approval"},
                {"from": "await_approval", "to": "execute_recovery"},
                {"from": "execute_recovery", "to": "verify_recovery"},
                {"from": "verify_recovery", "to": "notify"}
            ],
            "entry_point": "detect_issue",
            "security": {
                "auto_deploy_forbidden": true,
                "requires_human_approval": true,
                "approval_channel": "slack:#master-approvals"
            }
        }'::jsonb,
        '["coo-agent", "critic-agent"]'::jsonb,
        '["slack"]'::jsonb,
        '{"auto_deploy": false, "requires_approval": true, "notification_channel": "#master-alerts"}'::jsonb,
        true, true, 1,
        '00000000-0000-0000-0000-000000000001'
    )
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 5. Agent Assignments (assign agents to workspaces)
-- =============================================================================
-- Assign key agents to both workspaces
INSERT INTO agent_assignments (agent_id, workspace_id, assigned_by, position_x, position_y, status) VALUES
    -- Uncle Logitech workspace
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 100, 100, 'idle'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 300, 100, 'idle'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 200, 250, 'idle'),
    ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 400, 250, 'idle'),
    -- Cube System workspace
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 100, 100, 'idle'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 300, 100, 'idle'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 200, 250, 'idle'),
    ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 400, 250, 'idle'),
    ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 500, 100, 'idle');

-- =============================================================================
-- 6. Initial Audit Log Entries
-- =============================================================================
INSERT INTO audit_logs (workspace_id, user_id, action, category, resource_type, details, severity) VALUES
    (NULL, '00000000-0000-0000-0000-000000000001', 'system.seed_data_loaded', 'system', 'system', '{"description": "Initial seed data loaded for development environment"}'::jsonb, 'info'),
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'workspace.create', 'workspace', 'workspace', '{"workspace_name": "엉클로지텍", "workspace_slug": "uncle-logitech"}'::jsonb, 'info'),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'workspace.create', 'workspace', 'workspace', '{"workspace_name": "Cube System", "workspace_slug": "cube-system"}'::jsonb, 'info');
