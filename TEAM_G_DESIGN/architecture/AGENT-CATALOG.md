# The Master OS — 에이전트 카탈로그

> 카테고리별 대표 에이전트 템플릿 정의.
> 전체 100개 에이전트는 이 템플릿을 기반으로 법인별 요구에 따라 인스턴스화한다.

---

## 카테고리 총괄표

| # | 카테고리 | 에이전트 수 | 설명 |
|---|---------|------------|------|
| 1 | 기획/토론 스웜 | 3 | 다중 페르소나 기반 사업 기획 토론 |
| 2 | 사업계획서 스웜 | 3 | 시장 분석부터 초안 작성까지 자동화 |
| 3 | OSMU 마케팅 스웜 | 4 | 원소스 멀티유즈 콘텐츠 자동 생성 |
| 4 | 감사/행정 스웜 | 4 | 서류 판독, 입찰가 검증, 데이터 검사 |
| 5 | DevOps 스웜 | 3 | 모니터링, 핫픽스, 프록시 관리 |
| 6 | 지주회사 에이전트 | 4 | COO, CFO, 씽크탱크, SOP센터 |

---

## 1. 기획/토론 스웜 (Planning & Debate Swarm)

### 1-1. 낙관론자 (The Optimist)
```
이름: OptimistAgent
카테고리: 기획/토론 스웜
역할: 사업 아이디어의 긍정적 측면과 성장 가능성을 극대화하여 분석
입력: 사업 아이디어 텍스트, 시장 데이터
출력: 성장 가능성 보고서, 기회 요인 목록, 낙관적 시나리오
사용 모델: Claude Opus (깊은 추론 필요)
MCP 의존성: ChromaDB (시장 데이터 RAG)
```

### 1-2. 비관론자/심사위원 (The Critic)
```
이름: CriticAgent
카테고리: 기획/토론 스웜
역할: 사업 아이디어의 리스크, 취약점, 실패 가능성을 냉정하게 평가
입력: 사업 아이디어 텍스트, 낙관론자 분석 결과
출력: 리스크 평가서, 취약점 목록, 비관적 시나리오, 반론
사용 모델: Claude Opus (비판적 추론 필요)
MCP 의존성: ChromaDB (실패 사례 RAG)
```

### 1-3. 현실주의자 (The Realist)
```
이름: RealistAgent
카테고리: 기획/토론 스웜
역할: 낙관/비관 양측 의견을 종합하여 실행 가능한 현실적 결론 도출
입력: 낙관론자 보고서, 비관론자 평가서
출력: 최종 실행 계획 (Go/No-Go), 조건부 실행 로드맵, 리스크 완화 전략
사용 모델: Claude Opus (종합 판단)
MCP 의존성: 없음
```

---

## 2. 사업계획서 스웜 (Business Plan Swarm)

### 2-1. 시장 분석가 (Market Analyst)
```
이름: MarketAnalystAgent
카테고리: 사업계획서 스웜
역할: TAM-SAM-SOM 분석, 경쟁사 분석, 시장 트렌드 조사
입력: 사업 도메인 키워드, 타겟 시장 정보
출력: 시장 분석 보고서 (TAM/SAM/SOM 수치, 경쟁 지도, 트렌드 요약)
사용 모델: Claude Sonnet (빠른 조사)
MCP 의존성: FireCrawl (웹 데이터 수집), ChromaDB (시장 데이터 RAG)
```

### 2-2. 사업계획서 작성자 (Plan Writer)
```
이름: PlanWriterAgent
카테고리: 사업계획서 스웜
역할: 시장 분석 기반으로 사업계획서 초안 자동 작성
입력: 시장 분석 보고서, 사업 아이디어, 회사 정보
출력: 사업계획서 초안 (목차별 섹션 완성본)
사용 모델: Claude Opus (장문 작성)
MCP 의존성: Google Drive (템플릿 조회/결과 저장)
```

### 2-3. 재무 모델러 (Financial Modeler)
```
이름: FinancialModelerAgent
카테고리: 사업계획서 스웜
역할: 매출 예측, 비용 구조, 손익분기점 등 재무 모델 수립
입력: 시장 분석 데이터, 사업 모델 정보
출력: 재무 예측 표 (3년/5년), BEP 분석, 투자 회수 시나리오
사용 모델: Claude Sonnet (수치 처리)
MCP 의존성: 없음
```

---

## 3. OSMU 마케팅 스웜 v2 (One Source Multi Use Marketing Swarm)

> 업데이트: 2026.02.27 — 5개 전문 에이전트로 확장, 고급 바이럴 프롬프트 적용
> 파이프라인: validate → analyze → [blog/insta/newsletter/shortform 병렬] → drive_save → review → finalize

### 3-0. 마케팅 전략가 (Topic Analyst) ← 신규

```
이름: TopicAnalystAgent
Supabase ID: 20000000-0000-0000-0000-000000000007
slug: topic-analyst-agent
카테고리: OSMU 마케팅 스웜
역할: 마케팅 기획안을 분석하여 4채널 채널별 전략 브리핑 생성
사용 모델: claude-sonnet-4-20250514
크레딧: 0.07/실행
MCP 의존성: 없음

[내재화 스킬]
- Seth Godin 포지셔닝 철학
- Gary Vaynerchuk 채널별 맞춤화
- Alex Hormozi 가치 제안 구조화
- Eugene Schwartz 인식 단계 이론 (5단계)
- Robert Cialdini 심리 트리거 6원칙

[입력 파라미터]
- topic: 마케팅 기획안 원문
- brand_name: 브랜드명
- industry: 업종

[출력 JSON]
{
  "topic_summary": "3줄 요약",
  "target_audience": { "pain_points": [], "hidden_desires": [], "awareness_stage": 3 },
  "psychological_triggers": ["희소성", "사회적증명", "권위"],
  "core_message": "핵심 메시지 1문장",
  "channel_strategy": { "blog": {}, "instagram": {}, "newsletter": {}, "shortform": {} },
  "proof_elements": [],
  "cta_hierarchy": { "primary": "", "secondary": "" }
}
```

---

### 3-1. 블로그 작가 — 바이럴 버전 (Blog Writer V2) ← 전면 업그레이드

```
이름: BlogWriterAgentV2
Supabase ID: 20000000-0000-0000-0000-000000000008
slug: blog-writer-v2
카테고리: OSMU 마케팅 스웜
역할: 100만 조회수 + 베스트셀러 작가 기법으로 SEO 블로그 생성
사용 모델: claude-sonnet-4-20250514
크레딧: 0.08/실행
MCP 의존성: google_drive (find_or_create_folder)

[내재화 스킬]
- David Ogilvy: 헤드라인이 콘텐츠의 80% — 5개 제목 후보 작성
- Joe Sugarman 미끄러운 경사면: 모든 문장이 다음 문장으로 미끄러지게
- Eugene Schwartz: 갈망 극대화 (제품 말고 욕망을 팔아라)
- Neil Patel 10X 콘텐츠: 경쟁 콘텐츠보다 10배 더 가치 있게
- Gary Halbert 공감 오프닝: 독자 상황에 완전 공감으로 시작
- PAS + AIDA 혼합 구조

[훅 공식 선택]
- 충격 통계형: "한국 중소기업의 87%가 모르는 사실"
- 역설형: "더 많이 일할수록 더 가난해지는 이유"
- 공감형: "[타겟 상황]을 겪어보셨나요?"
- Big Promise형: "이 글을 읽으면 [구체적 결과]를 얻습니다"

[본문 구조]
1. HOOK (150자) — 스크롤 멈추게
2. Problem — 독자 문제를 당사자보다 잘 설명
3. Agitation — 방치하면 어떻게 되는가
4. Solution — 구체적 방법론
5. Authority — 데이터/사례로 신뢰
6. Action — 지금 할 수 있는 첫 단계

[출력 JSON]
{
  "title": "SEO 제목 (숫자+키워드+감정)",
  "title_variants": ["대안A", "대안B"],
  "meta_description": "140~155자",
  "hook": "첫 150자 훅",
  "content": "마크다운 본문 최소 2,500자",
  "seo_keywords": { "primary": "", "secondary": [], "longtail": [] },
  "hashtags": ["#태그 5개"],
  "cta": { "text": "", "type": "" },
  "psychological_triggers_used": []
}

[절대 금지]
- "안녕하세요, 오늘은 X에 대해 알아보겠습니다" 류의 뻔한 오프닝
- "많은 사람들이" 같은 애매한 표현 → 반드시 구체적 수치
```

---

### 3-2. 인스타그램 크리에이터 (Instagram Creator) ← 신규 구현

```
이름: InstaCreatorAgent
Supabase ID: 20000000-0000-0000-0000-000000000009
slug: insta-creator-agent
카테고리: OSMU 마케팅 스웜
역할: 100만 팔로워 크리에이터 기법으로 캐러셀 콘텐츠 생성
사용 모델: claude-sonnet-4-20250514
크레딧: 0.08/실행
MCP 의존성: figma (템플릿 적용), google_drive (저장)

[내재화 스킬]
- Alex Hormozi 캐러셀 공식: 슬라이드 1이 너무 좋아서 다음을 안 볼 수 없게
- Dan Koe 미니멀 하이밸류: 여백과 단순함이 전문성 증명
- Jay Shetty 감성 훅: 감정을 건드리면 저장·공유 폭발
- 인스타 알고리즘: 저장 > 공유 > 댓글 > 좋아요 순 도달 결정

[캐러셀 황금 공식]
- 슬라이드 1 (커버): 3초 안에 스크롤 멈추는 훅
  → 궁금증 갭 / Bold 숫자 / 역설 / 직접 호출
- 슬라이드 2~3 (공감): 독자 상황 정확히 묘사
- 슬라이드 4~6 (가치): 슬라이드당 핵심 1개 + 실행 팁
- 슬라이드 7 (CTA): 저장 + 공유 + 팔로우 3단 유도

[해시태그 전략 30개]
- 대형(100만+): 10개
- 중형(10~50만): 10개
- 소형(1~10만): 10개
- 업종 전용: 5개 필수

[출력 JSON]
{
  "slides": [{ "slide_no": 1, "type": "cover", "headline": "", "sub_text": "", "visual": {} }],
  "caption": "300자 캡션",
  "hashtags": { "mega": [], "mid": [], "niche": [], "industry": [] },
  "figma_params": { "template_id": "", "brand_color": "", "font_style": "" },
  "engagement_prediction": { "save_trigger": "", "share_trigger": "", "comment_trigger": "" }
}
```

---

### 3-3. 뉴스레터 작가 (Newsletter Writer) ← 신규 구현

```
이름: NewsletterAgent
Supabase ID: 20000000-0000-0000-0000-000000000010
slug: newsletter-writer
카테고리: OSMU 마케팅 스웜
역할: 영업왕 + 심리 마케팅으로 오픈율 50%+ 뉴스레터 생성
사용 모델: claude-haiku-4-5-20251001 (비용 절감)
크레딧: 0.04/실행
MCP 의존성: resend (발송), google_drive (저장)

[내재화 스킬]
- Ben Settle 일일이메일: 스토리로 시작, 판매는 부산물
- Russell Brunson Soap Opera Sequence: 오픈 루프로 다음 이메일 열게
- Dan Kennedy Direct Response: 모든 문장이 다음 문장을 읽게
- Justin Welsh: 한 가지 아이디어를 짧고 강하게
- 영업왕 판매 심리: 고객이 NO 할 수 없는 Irresistible Offer 구조

[제목줄 공식 — 오픈율 결정]
- 호기심 갭: "이 한 가지를 몰라서 놓치고 있었습니다"
- 숫자 약속: "17분 만에 [결과]를 얻는 방법"
- 역설: "팔려고 하지 않을수록 더 팔린다"
- 소문자 구어체: "솔직히 말할게요..." (친밀감)

[이메일 구조 — Soap Opera 공식]
1. 오프닝: 장면 묘사로 시작 (요약 절대 금지)
2. 갈등 고조: 독자 페인 포인트를 당사자보다 잘 설명
3. 해결사 등장: 핵심 인사이트 1가지
4. 오픈 루프: 다음 이메일 예고
5. CTA: 단 하나의 행동만 (버튼 1개)

[출력 JSON]
{
  "subject_a": "감성형 제목줄 A (40자 이내)",
  "subject_b": "이익형 제목줄 B (40자 이내)",
  "preheader": "70자 이내 프리헤더",
  "opening_story": "300자 오프닝 스토리",
  "html_body": "완성형 HTML",
  "text_body": "Plain text 버전",
  "cta": { "button_text": "5단어 이내", "urgency": "" },
  "open_loop": "다음 이메일 예고",
  "estimated_open_rate": "예상 오픈율 %"
}
```

---

### 3-4. 숏폼 스크립터 (Short-form Scripter) ← 신규 구현

```
이름: ShortFormAgent
Supabase ID: 20000000-0000-0000-0000-000000000011
slug: shortform-scriptwriter
카테고리: OSMU 마케팅 스웜
역할: MrBeast 공식 + 알고리즘 심리학으로 100만 조회수 숏폼 스크립트 생성
사용 모델: claude-sonnet-4-20250514
크레딧: 0.07/실행
MCP 의존성: google_drive (저장)
대상 플랫폼: 릴스 / 쇼츠 / 틱톡

[내재화 스킬]
- MrBeast 첫 3초 법칙: 첫 3초에 끝까지 볼 이유를 모두 담아라
- Alex Hormozi Hook-Retain-Reward: 완벽한 도파민 루프
- TikTok/Reels 알고리즘: 완료율 > 재시청 > 공유 > 댓글 순
- 패턴 인터럽트: 3~5초마다 시각·청각 변화로 이탈 방지

[숏폼 황금 구조]
- 0~3초 (훅): "○○를 하지 마세요. 대신 이걸" / "솔직히 말할게요"
- 3~40초 (유지): 패턴 인터럽트 + 오픈 루프 연속
- 40~60초 (보상+CTA): 가장 강력한 가치를 마지막에

[패턴 인터럽트 규칙]
매 3~5초마다: 화면 전환 / 말 속도 변화 / 숫자 목록 / 오픈 루프

[출력 JSON]
{
  "platform": "reels",
  "total_duration_sec": 45,
  "hook": { "text": "", "visual": "", "caption": "" },
  "scenes": [{ "scene_no": 1, "start_sec": 0, "end_sec": 3, "narration": "", "visual": "", "caption_text": "", "bgm": "energetic", "edit_note": "" }],
  "srt_content": "자막 파일 내용",
  "cta": { "text": "", "action": "follow/save/comment" },
  "pattern_interrupts": ["3초", "8초", "16초"],
  "retention_prediction": "예상 완료율 %"
}
```

---

## 4. 감사/행정 스웜 (Audit & Admin Swarm)

### 4-1. OCR 판독관 (Document Scanner)
```
이름: OCRScannerAgent
카테고리: 감사/행정 스웜
역할: 행정서류, 계약서, 세금계산서의 텍스트를 추출하고 구조화
입력: 문서 이미지/PDF 파일
출력: 구조화된 텍스트 데이터 (JSON), 핵심 필드 추출 결과
사용 모델: Claude Sonnet (추출 결과 검증)
MCP 의존성: PaddleOCR (텍스트 추출)
```

### 4-2. 입찰가 검증관 (Bid Auditor)
```
이름: BidAuditorAgent
카테고리: 감사/행정 스웜
역할: 입찰가 산출 내역의 오류, 누락, 이상치를 검증
입력: 입찰가 산출서 데이터, 기준 단가표
출력: 검증 보고서 (오류 항목, 수정 제안, 신뢰도 점수)
사용 모델: Claude Opus (정밀 검증 필요)
MCP 의존성: ChromaDB (과거 입찰 데이터 RAG)
```

### 4-3. 데이터 양식 검사관 (Data Validator)
```
이름: DataValidatorAgent
카테고리: 감사/행정 스웜
역할: 서류의 필수 항목 누락, 날짜 오류, 양식 불일치를 검사
입력: OCR 추출 데이터, 양식 규격 정의
출력: 검사 결과 (통과/미통과), 누락/오류 항목 목록
사용 모델: Claude Haiku (빠른 규칙 기반 검증)
MCP 의존성: 없음
```

### 4-4. 문서 분류/보관관 (Document Archiver)
```
이름: DocArchiverAgent
카테고리: 감사/행정 스웜
역할: 검증 완료된 서류를 카테고리별로 분류 후 Drive에 보관, Slack 알림
입력: 검증 완료 문서, 법인/카테고리 정보
출력: Drive 업로드 확인, Slack 알림 발송 확인
사용 모델: Claude Haiku (간단한 분류)
MCP 의존성: Google Drive (문서 보관), Slack (알림)
```

---

## 5. DevOps 스웜 (DevOps Swarm)

### 5-1. 모니터링 에이전트 (System Monitor)
```
이름: SystemMonitorAgent
카테고리: DevOps 스웜
역할: API 헬스체크, 에러율 모니터링, 성능 임계치 감시
입력: 시스템 메트릭 스트림 (API 응답 시간, 에러율, CPU/메모리)
출력: 헬스 리포트, 이상 탐지 알림, 성능 트렌드 분석
사용 모델: Claude Haiku (빠른 판단)
MCP 의존성: Slack (장애 알림)
```

### 5-2. 핫픽스 에이전트 (Hotfix Agent)
```
이름: HotfixAgent
카테고리: DevOps 스웜
역할: 크롤링 차단, API 에러 등 발생 시 자동 핫픽스 적용
입력: 장애 알림 (에러 유형, 영향 범위)
출력: 핫픽스 코드 적용 결과, 복구 확인 보고
사용 모델: Claude Sonnet (코드 수정)
MCP 의존성: Slack (복구 알림)
```

### 5-3. 프록시/키 로테이션 에이전트 (Proxy Manager)
```
이름: ProxyManagerAgent
카테고리: DevOps 스웜
역할: IP 차단 시 프록시 우회, API 키 만료 시 로테이션 실행
입력: 차단/만료 이벤트
출력: 프록시 전환 결과, 키 로테이션 결과, Vault 업데이트 확인
사용 모델: Claude Haiku (빠른 실행)
MCP 의존성: FireCrawl (프록시 설정), Slack (상태 알림)
```

---

## 6. 지주회사 에이전트 (Holding Company Agents)

### 6-1. AI 총괄 사장 (COO)
```
이름: COOAgent
카테고리: 지주회사 에이전트
역할: 전 부서 에이전트 스케줄 강제 할당, 파이프라인 가동 지시, 우선순위 조정
입력: 회장 명령, 법인별 작업 큐, 에이전트 가용 현황
출력: 에이전트 할당 계획, 파이프라인 실행 지시, 일일 운영 보고서
사용 모델: Claude Opus (전략적 판단)
MCP 의존성: Slack (보고/결재 요청)
```

### 6-2. 통합 자산 통제관 (CFO & CISO)
```
이름: CFOAgent
카테고리: 지주회사 에이전트
역할: AI 토큰 소모량(마스터 크레딧) 계산, 비용 최적화, API 키 보안 감독
입력: 토큰 사용 로그, 비용 데이터, Vault 접근 이력
출력: 비용 보고서, 예산 경고, 키 로테이션 지시, 보안 감사 리포트
사용 모델: Claude Sonnet (수치 분석)
MCP 의존성: Slack (비용 알림)
```

### 6-3. 씽크탱크 (Innovation Lab)
```
이름: ThinkTankAgent
카테고리: 지주회사 에이전트
역할: 신규 사업 기획, 시스템 로직 자가 발전 제안, 트렌드 기반 기회 탐색
입력: 시장 트렌드 데이터, 현 사업 포트폴리오 정보
출력: 신규 사업 제안서, 시스템 개선 제안, 기회 분석 보고서
사용 모델: Claude Opus (창의적 추론)
MCP 의존성: FireCrawl (트렌드 수집), ChromaDB (과거 기획 RAG)
```

### 6-4. SOP 센터 (Process Designer)
```
이름: SOPCenterAgent
카테고리: 지주회사 에이전트
역할: 신규 업무 A~Z 파이프라인 설계, 매뉴얼화, 에이전트 조합 추천
입력: 업무 요구사항, 기존 SOP 데이터
출력: SOP 문서, 파이프라인 설계도, 에이전트 조합 추천표
사용 모델: Claude Sonnet (구조화 작성)
MCP 의존성: Google Drive (SOP 저장), ChromaDB (기존 SOP RAG)
```

---

## 에이전트 라이프사이클

```
[대기열 Pool] → 회장 Drag & Drop → [법인 할당] → [파이프라인 투입] → [실행] → [결과 보고] → [대기열 복귀]
     │                                                                              │
     └──────────────────── COO 자동 스케줄링 ──────────────────────────────────────────┘
```

## 모델 사용 가이드라인

| 모델 | 용도 | 비용 등급 |
|------|------|----------|
| Claude Opus | 깊은 추론, 전략 판단, 장문 작성, 정밀 검증 | 높음 |
| Claude Sonnet | 일반 분석, 코드 작성, 콘텐츠 생성 | 중간 |
| Claude Haiku | 빠른 분류, 단순 검증, 알림 처리 | 낮음 |
| GPT-4o | Opus 대체 (비용 분산 시), 이미지 분석 보조 | 중간 |
| 로컬 LLM | 민감 데이터 처리, 오프라인 폴백 | 없음 (인프라 비용만) |
