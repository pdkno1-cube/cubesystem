-- =============================================================================
-- Migration: ShortFormAgent Seed + OSMU Pipeline 10-node Upsert
-- The Master OS — Phase 4 M-05 (ShortFormAgent) + M-06 (OSMU 10-node)
-- PRD ref: TEAM_G_DESIGN/prd/PRD-MARKETING-AUTO-v1.md
-- =============================================================================

-- =============================================================================
-- Seed: ShortFormAgent
-- OSMU pipeline node: transforms research → short-form video script (30-60s)
-- MrBeast formula: hook(3s) + conflict(5s) + story(40s) + CTA(5s) + outro(5s)
-- =============================================================================
INSERT INTO agents (
    name,
    display_name,
    slug,
    description,
    icon,
    category,
    role_description,
    model_provider,
    model,
    system_prompt,
    capabilities,
    config,
    is_system,
    cost_per_run,
    status
)
VALUES (
    'ShortFormAgent',
    '숏폼 스크립트 에이전트',
    'shortform-scriptwriter',
    'OSMU 파이프라인 노드: 리서치 결과를 30~60초 숏폼(Reels/TikTok/Shorts) 스크립트로 변환합니다. '
    'MrBeast 공식 적용, BGM 추천, SRT 자막 포함.',
    '🎬',
    'marketing',
    '숏폼 영상 스크립트와 자막을 생성하는 마케팅 에이전트',
    'anthropic',
    'claude-haiku-4-5-20251001',
    '당신은 숏폼 영상 스크립트 전문 에이전트입니다.

주어진 리서치 자료와 핵심 메시지를 기반으로 30~60초짜리 숏폼 영상 스크립트를 생성합니다.

## 출력 형식
반드시 다음 JSON 구조로만 응답하세요:
```json
{
  "total_duration_sec": 45,
  "scenes": [
    {
      "id": 1,
      "start_sec": 0,
      "end_sec": 3,
      "type": "hook",
      "script": "나레이션/대사 텍스트",
      "visual_direction": "화면 설명 (영어)",
      "on_screen_text": "화면에 표시될 텍스트"
    }
  ],
  "bgm": {
    "mood": "energetic",
    "tempo": "fast",
    "suggestions": ["제목1 (아티스트)", "제목2 (아티스트)"],
    "volume_note": "나레이션 구간 30%, 후크/아웃트로 60%"
  },
  "srt": "1\n00:00:00,000 --> 00:00:03,000\n나레이션 텍스트\n\n2\n...",
  "thumbnail_hook": "썸네일 핵심 카피 (20자 이내)",
  "platform_notes": {
    "instagram_reels": "추천 해시태그 5개",
    "youtube_shorts": "제목 최적화 팁",
    "tiktok": "트렌드 사운드 추천"
  }
}
```

## MrBeast 공식 (필수 적용)
- **Hook (0~3초)**: 보는 사람이 멈추게 만드는 질문/충격/호기심
- **Conflict (3~8초)**: 문제/갈등 제시 — 왜 중요한가?
- **Story (8~50초)**: 핵심 내용 전달 (숫자/증거/시각 강조)
- **CTA (50~55초)**: 구체적인 행동 유도
- **Outro (55~60초)**: 브랜드 + 다음 영상 예고

## 원칙
- 나레이션: 짧고 강렬한 한국어 (문장당 최대 15자)
- BGM: 저작권 무료 또는 YouTube Audio Library 수준
- SRT: 타임코드 정확하게, 2줄 이하 per 자막
- 브랜드: The Master OS — AI 자동화, 1인 창업',
    '["shortform_script", "srt_subtitle", "bgm_recommendation", "scene_direction", "platform_optimization"]'::jsonb,
    '{
      "min_duration_sec": 30,
      "max_duration_sec": 60,
      "formula": "mrBeast",
      "platforms": ["instagram_reels", "youtube_shorts", "tiktok"],
      "language": "ko",
      "brand_voice": "The Master OS"
    }'::jsonb,
    true,
    0.0007,
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    display_name    = EXCLUDED.display_name,
    description     = EXCLUDED.description,
    system_prompt   = EXCLUDED.system_prompt,
    capabilities    = EXCLUDED.capabilities,
    config          = EXCLUDED.config,
    model           = EXCLUDED.model,
    cost_per_run    = EXCLUDED.cost_per_run,
    updated_at      = now();

-- =============================================================================
-- Seed: TopicAnalystAgent
-- OSMU pipeline entry node: analyze topic + generate marketing strategy
-- =============================================================================
INSERT INTO agents (
    name,
    display_name,
    slug,
    description,
    icon,
    category,
    role_description,
    model_provider,
    model,
    system_prompt,
    capabilities,
    config,
    is_system,
    cost_per_run,
    status
)
VALUES (
    'TopicAnalystAgent',
    '마케팅 전략 분석 에이전트',
    'topic-analyst-agent',
    'OSMU 파이프라인 첫 번째 노드: 주제 분석 + 마케팅 전략 수립. '
    '블로그/인스타/뉴스레터/숏폼 4채널에 최적화된 키워드와 메시지 포인트를 제공.',
    '🧠',
    'marketing',
    '마케팅 전략과 콘텐츠 방향을 수립하는 분석 에이전트',
    'anthropic',
    'claude-sonnet-4-6',
    '당신은 마케팅 전략 전문 에이전트입니다.

주어진 주제/기획안을 분석하여 4개 채널(블로그, 인스타그램, 뉴스레터, 숏폼)에 최적화된 마케팅 전략을 수립합니다.

## 출력 형식
반드시 다음 JSON 구조로만 응답하세요:
```json
{
  "topic_summary": "주제 요약 (100자 이내)",
  "target_audience": "타겟 독자/시청자 설명",
  "core_message": "핵심 메시지 (1문장)",
  "key_points": ["포인트1", "포인트2", "포인트3"],
  "keywords": {
    "primary": ["키워드1", "키워드2"],
    "secondary": ["키워드3", "키워드4"],
    "long_tail": ["긴 꼬리 키워드1"]
  },
  "channel_strategy": {
    "blog": "블로그 방향: 제목 후보 + 구성 요소",
    "instagram": "인스타 방향: 캐러셀 주제 + 주요 슬라이드",
    "newsletter": "뉴스레터 방향: 제목 후보 + 구성 섹션",
    "shortform": "숏폼 방향: 후크 아이디어 + 핵심 메시지"
  },
  "trending_angles": ["트렌드 각도1", "트렌드 각도2"],
  "cta": "공통 행동 유도 문구"
}
```

## 원칙
- SEO 관점에서 검색 의도(Search Intent) 분석 포함
- 2026년 현재 트렌드 반영
- 브랜드 일관성: The Master OS — AI 자동화, 1인 창업 인사이트',
    '["topic_analysis", "keyword_research", "channel_strategy", "seo_optimization"]'::jsonb,
    '{
      "channels": ["blog", "instagram", "newsletter", "shortform"],
      "language": "ko",
      "seo_focus": true
    }'::jsonb,
    true,
    0.0070,
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    display_name    = EXCLUDED.display_name,
    description     = EXCLUDED.description,
    system_prompt   = EXCLUDED.system_prompt,
    capabilities    = EXCLUDED.capabilities,
    config          = EXCLUDED.config,
    model           = EXCLUDED.model,
    cost_per_run    = EXCLUDED.cost_per_run,
    updated_at      = now();

-- =============================================================================
-- Seed: OSMU Marketing Pipeline (10-node, v2)
-- Upsert into pipelines table so the pipeline is accessible via API
-- =============================================================================
INSERT INTO pipelines (
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
    'OSMU Marketing',
    'osmu-marketing',
    'One Source Multi Use 마케팅 파이프라인 v2 — 기획안 1개로 블로그/인스타/뉴스레터/숏폼 4채널 동시 생성 후 뉴스레터 자동 발송',
    'osmu_marketing',
    '{
      "entry_point": "validate_input",
      "nodes": [
        {"id": "validate_input",       "type": "validation",      "label": "입력 검증"},
        {"id": "analyze_topic",        "type": "agent_call",      "label": "마케팅 전략 분석 (TopicAnalystAgent)"},
        {"id": "generate_blog",        "type": "agent_call",      "label": "블로그 생성 — 100만 조회수 공식 (BlogWriterV2)"},
        {"id": "generate_insta",       "type": "agent_call",      "label": "인스타 캐러셀 생성 (InstaCreatorAgent)"},
        {"id": "generate_newsletter",  "type": "agent_call",      "label": "뉴스레터 생성 — 오픈율 50%+ (NewsletterAgent)"},
        {"id": "generate_shortform",   "type": "agent_call",      "label": "숏폼 스크립트 생성 — MrBeast 공식 (ShortFormAgent)"},
        {"id": "drive_save",           "type": "mcp_call",        "label": "Google Drive 저장 (폴더 자동 정리)"},
        {"id": "review_all",           "type": "agent_call",      "label": "전체 품질 검토 (CriticAgent)"},
        {"id": "send_newsletter",      "type": "newsletter_send", "label": "뉴스레터 구독자 자동 발송 (Resend)"},
        {"id": "finalize",             "type": "output",          "label": "완료 알림 (Slack)"}
      ],
      "edges": [
        {"from": "validate_input",      "to": "analyze_topic"},
        {"from": "analyze_topic",       "to": "generate_blog"},
        {"from": "analyze_topic",       "to": "generate_insta"},
        {"from": "analyze_topic",       "to": "generate_newsletter"},
        {"from": "analyze_topic",       "to": "generate_shortform"},
        {"from": "generate_blog",       "to": "drive_save"},
        {"from": "generate_insta",      "to": "drive_save"},
        {"from": "generate_newsletter", "to": "drive_save"},
        {"from": "generate_shortform",  "to": "drive_save"},
        {"from": "drive_save",          "to": "review_all"},
        {"from": "review_all",          "to": "send_newsletter"},
        {"from": "send_newsletter",     "to": "finalize"}
      ]
    }'::jsonb,
    '["topic-analyst-agent","blog-writer-v2","insta-creator","newsletter-writer","shortform-scriptwriter","critic-agent"]'::jsonb,
    '["google_drive","slack","resend"]'::jsonb,
    true,
    true,
    2
)
ON CONFLICT (slug) DO UPDATE SET
    description      = EXCLUDED.description,
    graph_definition = EXCLUDED.graph_definition,
    required_agents  = EXCLUDED.required_agents,
    required_mcps    = EXCLUDED.required_mcps,
    version          = EXCLUDED.version,
    updated_at       = now();
