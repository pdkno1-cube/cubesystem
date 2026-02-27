# SKILL-SHORTFORM-AGENT

> 버전: v1.0 | 작성: TEAM_F_SKILLS | 2026-02-27
> 구현: `supabase/migrations/20260227000010_shortform_agent_and_osmu_pipeline.sql`
> 노드 타입: `agent_call` (OSMU 파이프라인 6번 노드)

---

## 개요

리서치 결과를 30~60초 숏폼(Instagram Reels / YouTube Shorts / TikTok) 스크립트로 변환하는 OSMU 파이프라인 노드.

**MrBeast 공식** 적용:
```
Hook(3s) → Conflict(5s) → Story(40s) → CTA(5s) → Outro(5s) = 58s
```

---

## 에이전트 정보

| 속성 | 값 |
|------|-----|
| slug | `shortform-scriptwriter` |
| model | `claude-haiku-4-5-20251001` (속도/비용 최적화) |
| cost_per_run | 0.0007 credits |
| category | marketing |

---

## 출력 스키마

```json
{
  "total_duration_sec": 45,
  "scenes": [
    {
      "id": 1,
      "start_sec": 0,
      "end_sec": 3,
      "type": "hook",
      "script": "AI로 하루 만에 월급을 버는 방법?",
      "visual_direction": "Close-up of laptop screen showing revenue dashboard",
      "on_screen_text": "AI 자동화 = 월급 대체"
    }
  ],
  "bgm": {
    "mood": "energetic",
    "tempo": "fast",
    "suggestions": ["Upbeat Electronic (NoCopyrightSounds)", "Inspiring Piano Loop (Pixabay)"],
    "volume_note": "나레이션 구간 30%, 후크/아웃트로 60%"
  },
  "srt": "1\n00:00:00,000 --> 00:00:03,000\nAI로 하루 만에 월급을...",
  "thumbnail_hook": "AI가 대신 일해줌",
  "platform_notes": {
    "instagram_reels": "#ai자동화 #1인창업 #더마스터OS",
    "youtube_shorts": "제목에 숫자 포함 권장 — '30초만에...'",
    "tiktok": "트렌드 사운드: Viral Hook Beat 2026"
  }
}
```

---

## OSMU 파이프라인 위치

```
analyze_topic (2)
    ↓
generate_shortform (6) ← ShortFormAgent
    ↓
drive_save (7) → Google Drive 저장
```

병렬 실행: `generate_blog`, `generate_insta`, `generate_newsletter`와 동시 실행.

---

## 테스트

```bash
# 단위 테스트 위치
apps/api/tests/test_shortform_agent.py

# DB 확인
SELECT slug, model, cost_per_run FROM agents WHERE slug = 'shortform-scriptwriter';
```
