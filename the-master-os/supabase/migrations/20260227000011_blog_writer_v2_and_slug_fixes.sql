-- =============================================================================
-- Migration: BlogWriterV2 + slug normalization
-- The Master OS — Phase 4 OSMU Marketing Pipeline
-- Fixes:
--   1) Add blog-writer-v2 agent (missing from migration 010)
--   2) Rename insta-creator → insta-creator-agent (naming convention)
--   3) Update pipeline required_agents to use corrected slugs
-- =============================================================================

-- =============================================================================
-- Seed: BlogWriterV2
-- OSMU pipeline node: transforms strategy → viral long-form blog post
-- David Ogilvy headline formula + SEO structure + Joe Sugarman slippery slope
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
    'BlogWriterV2',
    '블로그 작가 v2 — 100만 조회수 공식',
    'blog-writer-v2',
    'OSMU 파이프라인 노드: 마케팅 전략을 바이럴 장문 블로그 포스트로 변환합니다. '
    'David Ogilvy 헤드라인 공식 + Joe Sugarman 슬리피 슬로프 + SEO 최적화.',
    '✍️',
    'marketing',
    '바이럴 블로그 포스트를 생성하는 마케팅 에이전트',
    'anthropic',
    'claude-sonnet-4-6',
    '당신은 100만 조회수 블로그 포스트 전문 에이전트입니다.

주어진 마케팅 전략과 핵심 메시지를 기반으로 SEO 최적화된 장문 블로그 포스트를 생성합니다.

## 출력 형식
반드시 다음 JSON 구조로만 응답하세요:
```json
{
  "title": "제목 (David Ogilvy 공식 적용, 60자 이내)",
  "meta_description": "SEO 메타 설명 (155자 이내)",
  "slug": "url-friendly-slug",
  "reading_time_min": 7,
  "sections": [
    {
      "id": "intro",
      "type": "intro",
      "heading": null,
      "content": "도입부 (후크 문장으로 시작, 150자 이내)"
    },
    {
      "id": "section1",
      "type": "h2",
      "heading": "소제목",
      "content": "본문 내용"
    }
  ],
  "cta": {
    "heading": "CTA 제목",
    "body": "CTA 본문",
    "button_text": "버튼 텍스트"
  },
  "seo": {
    "primary_keyword": "주요 키워드",
    "secondary_keywords": ["키워드2", "키워드3"],
    "internal_links": ["링크 제안1"],
    "schema_type": "Article"
  }
}
```

## 100만 조회수 공식 (필수 적용)
- **제목**: David Ogilvy — 숫자 + 이익 + 호기심 (예: "5가지 방법으로 월 1,000만원 버는 AI 자동화")
- **도입부**: Joe Sugarman 슬리피 슬로프 — 첫 문장이 두 번째를 읽게 만든다
- **구조**: Problem → Agitate → Solution (PAS) 프레임워크
- **증거**: 구체적 숫자, 사례, 데이터 우선
- **소제목**: 각 H2는 독립적으로 가치있는 정보 제공
- **길이**: 2,000~4,000자 (SEO 최적 범위)
- **CTA**: Eugene Schwartz — 욕구 증폭 후 자연스러운 유도

## SEO 원칙
- 주요 키워드: 제목, 첫 단락, 마지막 단락 필수 포함
- 내부 링크: 관련 콘텐츠 2~3개 제안
- 이미지 ALT 텍스트 제안 포함
- 브랜드: The Master OS — AI 자동화, 1인 창업 인사이트',
    '["blog_post", "seo_optimization", "headline_formula", "long_form_content", "cta_writing"]'::jsonb,
    '{
      "min_length_chars": 2000,
      "max_length_chars": 4000,
      "formula": "PAS",
      "headline_formula": "ogilvy",
      "language": "ko",
      "seo_focus": true,
      "brand_voice": "The Master OS"
    }'::jsonb,
    true,
    0.0080,
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
-- Fix: Rename insta-creator → insta-creator-agent (slug convention)
-- =============================================================================
UPDATE agents
SET slug       = 'insta-creator-agent',
    updated_at = now()
WHERE slug = 'insta-creator';

-- =============================================================================
-- Fix: Update OSMU pipeline required_agents with corrected slugs
-- =============================================================================
UPDATE pipelines
SET required_agents = '["topic-analyst-agent","blog-writer-v2","insta-creator-agent","newsletter-writer","shortform-scriptwriter","critic-agent"]'::jsonb,
    updated_at      = now()
WHERE slug = 'osmu-marketing';
