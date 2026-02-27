# SKILL-NEWSLETTER-AGENT

> 버전: v1.0 | 작성: TEAM_F_SKILLS | 2026-02-27
> 구현: `apps/api/app/routers/marketing.py` + `apps/api/app/mcp/resend.py`

---

## 개요

뉴스레터 발송 및 구독자 관리를 위한 마케팅 자동화 스킬.
Resend Email API를 통해 HTML 뉴스레터를 최대 100명씩 배치 전송.

---

## 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/orchestrate/marketing/newsletter/send` | 구독자 일괄 발송 |
| POST | `/orchestrate/marketing/newsletter/send-single` | 단건 트랜잭션 이메일 |
| GET | `/orchestrate/marketing/subscribers` | 구독자 목록 |
| POST | `/orchestrate/marketing/subscribers` | 구독자 추가 |
| DELETE | `/orchestrate/marketing/subscribers/{email}` | 수신거부 처리 |
| POST | `/orchestrate/marketing/schedules` | 콘텐츠 예약 생성 |
| GET | `/orchestrate/marketing/schedules` | 예약 목록 조회 |
| PATCH | `/orchestrate/marketing/schedules/{id}` | 예약 상태 업데이트 |

---

## OSMU 파이프라인 연동 패턴

```python
# NewsletterAgent → Resend 발송 흐름
# Pipeline: research → NewsletterAgent → Resend send_batch

# 1. NewsletterAgent가 HTML 생성
newsletter_result = await registry.execute_tool(
    mcp_name="agent_invoke",
    workspace_id=workspace_id,
    action="invoke",
    params={
        "agent_id": "newsletter-writer",
        "messages": [{"role": "user", "content": research_summary}],
    }
)

# 2. 뉴스레터 발송 (POST /newsletter/send)
send_result = await client.post("/orchestrate/marketing/newsletter/send", json={
    "workspace_id": workspace_id,
    "subject": newsletter_result["subject"],
    "html": newsletter_result["html"],
    "text": newsletter_result["text"],
    "tags": ["weekly-digest"]  # 특정 태그 구독자에게만
})
# → {"sent_count": 127, "failed_count": 0, "email_ids": [...]}
```

---

## NewsletterAgent 출력 스키마

```json
{
  "subject": "이메일 제목 (50자 이내)",
  "preview_text": "프리뷰 텍스트 (90자 이내)",
  "html": "<html>...</html>",
  "text": "plain text 버전"
}
```

---

## InstaCreatorAgent 출력 스키마

```json
{
  "caption": "인스타그램 캡션 (최대 2,200자)",
  "hashtags": ["ai자동화", "1인창업", ...],
  "cta": "링크 클릭해서 자세히 보기 👇",
  "image_prompt": "Minimalist workspace with AI dashboard..."
}
```

---

## DB 테이블

### newsletter_subscribers
- `workspace_id`, `email` (UNIQUE 복합키)
- `status`: active | unsubscribed | bounced | complained
- `tags`: JSONB 배열 (세그멘테이션)

### content_schedules
- `channel`: instagram | newsletter | twitter | linkedin | blog
- `status`: pending | running | completed | failed | cancelled
- `recurrence`: none | daily | weekly | monthly
- `content`: JSONB (채널별 콘텐츠 데이터)

### content_metrics
- `impressions`, `clicks`, `likes`, `shares`, `opens`, `unsubscribes`
- UNIQUE (schedule_id, metric_date)

---

## 보안

- Resend API Key → Secret Vault 저장 (P0)
- 이메일 수신거부 → soft delete (deleted_at 설정)
- 배치 발송 실패 → partial failure 허용 (failed_count 반환)
- 모든 발송 이벤트 → audit_logs 기록

---

## 테스트

```bash
# 단위 테스트
apps/api/tests/test_marketing_router.py

# 수동 검증
# 1. POST /subscribers → 구독자 추가 확인
# 2. POST /newsletter/send → Resend 발송 확인
# 3. GET /subscribers → 목록 조회 확인
# 4. DELETE /subscribers/{email} → 수신거부 확인
```
