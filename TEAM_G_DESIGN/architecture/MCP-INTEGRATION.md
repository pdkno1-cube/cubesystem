# The Master OS — MCP 통합 매핑표

## 연동 서비스 총괄표

| # | 서비스 | 용도 | 연동 방식 | 프로토콜 | 인증 방식 | 데이터 흐름 |
|---|--------|------|-----------|----------|-----------|-------------|
| 1 | FireCrawl | 웹 스크래핑 (정부조달/입찰 수집) | MCP Server | REST API | API Key | 단방향 (수집→시스템) |
| 2 | PaddleOCR | 서류 판독 (행정서류 검증) | MCP Server / Self-hosted API | REST API | Internal (서비스간 인증) | 단방향 (문서→텍스트) |
| 3 | Google Drive | 문서 입출력 (서류 저장소) | MCP Server / OAuth | REST API (Google API) | OAuth 2.0 (Service Account) | 양방향 (업로드/다운로드) |
| 4 | Figma | 이미지 렌더링 (OSMU 마케팅) | MCP Server / REST API | REST API | API Key (Personal Access Token) | 양방향 (템플릿 조회/렌더 요청) |
| 5 | Slack | 결재/보고 (알림 채널) | MCP Server / Webhook | WebSocket + Webhook | OAuth 2.0 (Bot Token) | 양방향 (알림 발송/명령 수신) |
| 6 | ChromaDB | RAG 벡터DB (자격 대조) | 직접 연동 (Python Client) | gRPC / HTTP | Internal (네트워크 격리) | 양방향 (임베딩 저장/쿼리) |

---

## 1. FireCrawl — 웹 스크래핑

### 개요
정부조달 공고, 입찰 정보, 경쟁사 데이터 등을 자동으로 수집하는 웹 스크래핑 서비스.

### 연동 상세
| 항목 | 내용 |
|------|------|
| **연동 프로토콜** | REST API (HTTPS) |
| **MCP 서버 타입** | `firecrawl-mcp-server` |
| **인증 방식** | API Key (Header: `Authorization: Bearer <key>`) |
| **데이터 흐름** | 단방향 — FireCrawl → 시스템 (수집 결과 수신) |
| **사용 파이프라인** | Grant Factory (정부지원사업/조달 입찰 팩토리) |

### 주요 API 호출
| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| POST | `/v1/scrape` | 단일 URL 스크래핑 |
| POST | `/v1/crawl` | 사이트 크롤링 (다중 페이지) |
| GET | `/v1/crawl/:id` | 크롤링 상태 확인 |

### 에러 시 폴백 전략
1. **1차**: 재시도 (exponential backoff, 최대 3회)
2. **2차**: 대체 프록시 IP로 우회 요청
3. **3차**: DevOps 에이전트 알림 → 수동 개입 플래그

---

## 2. PaddleOCR — 서류 판독

### 개요
행정서류, 계약서, 세금계산서 등의 이미지/PDF에서 텍스트를 추출하는 OCR 서비스.

### 연동 상세
| 항목 | 내용 |
|------|------|
| **연동 프로토콜** | REST API (자체 호스팅) |
| **MCP 서버 타입** | `paddleocr-mcp-server` (커스텀) |
| **인증 방식** | Internal Service Token (서비스 메시 내부 통신) |
| **데이터 흐름** | 단방향 — 이미지/PDF → OCR 텍스트 결과 |
| **사용 파이프라인** | 행정/B2B 서류 3단계 자동 검증 |

### 주요 API 호출
| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| POST | `/ocr/detect` | 문서 텍스트 추출 |
| POST | `/ocr/table` | 표 구조 인식 |
| POST | `/ocr/validate` | 문서 양식 검증 (날짜, 금액 패턴) |

### 에러 시 폴백 전략
1. **1차**: 이미지 전처리(회전, 대비 조절) 후 재시도
2. **2차**: 대체 OCR 엔진(Tesseract) 시도
3. **3차**: 감사 로그에 "수동 검증 필요" 플래그 기록

---

## 3. Google Drive — 문서 입출력

### 개요
법인별 서류 저장, 사업계획서 출력, 감사 문서 아카이빙을 위한 클라우드 저장소.

### 연동 상세
| 항목 | 내용 |
|------|------|
| **연동 프로토콜** | REST API (Google Drive API v3) |
| **MCP 서버 타입** | `google-drive-mcp-server` |
| **인증 방식** | OAuth 2.0 — Service Account (서버사이드 키 파일) |
| **데이터 흐름** | 양방향 — 업로드(서류 저장), 다운로드(서류 조회) |
| **사용 파이프라인** | 전 파이프라인 공통 (문서 아카이빙) |

### 주요 API 호출
| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| POST | `/upload/drive/v3/files` | 파일 업로드 |
| GET | `/drive/v3/files/:id` | 파일 메타데이터 조회 |
| GET | `/drive/v3/files/:id?alt=media` | 파일 다운로드 |
| POST | `/drive/v3/files/:id/copy` | 문서 복제 (템플릿 기반 생성) |

### 폴더 구조 규칙
```
The Master OS/
├── [법인명]/
│   ├── 입찰서류/
│   ├── 계약서/
│   ├── 세금계산서/
│   └── 마케팅/
├── _감사아카이브/
└── _템플릿/
```

### 에러 시 폴백 전략
1. **1차**: 토큰 갱신 후 재시도
2. **2차**: 로컬 스토리지에 임시 저장 → 배치 업로드 큐 등록
3. **3차**: Slack 알림 ("Drive 연동 장애") 발송

---

## 4. Figma — 이미지 렌더링

### 개요
OSMU 마케팅 콘텐츠(인스타 포스트, 블로그 썸네일, 뉴스레터 비주얼)를 템플릿 기반으로 자동 렌더링.

### 연동 상세
| 항목 | 내용 |
|------|------|
| **연동 프로토콜** | REST API (Figma API) |
| **MCP 서버 타입** | `figma-mcp-server` |
| **인증 방식** | API Key (Personal Access Token, Header) |
| **데이터 흐름** | 양방향 — 템플릿 조회 + 변수 주입 → 렌더링 결과 수신 |
| **사용 파이프라인** | OSMU 마케팅 스웜 |

### 주요 API 호출
| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| GET | `/v1/files/:file_key` | Figma 파일(템플릿) 조회 |
| GET | `/v1/files/:file_key/nodes` | 특정 노드/컴포넌트 조회 |
| GET | `/v1/images/:file_key` | 노드를 이미지로 렌더 (PNG/SVG) |
| PUT | `/v1/files/:file_key/variables` | 변수 주입 (텍스트, 색상 변경) |

### 에러 시 폴백 전략
1. **1차**: API Rate Limit 시 큐잉 후 순차 처리
2. **2차**: 렌더 실패 시 기본 템플릿 이미지로 대체
3. **3차**: 감사 로그에 "수동 디자인 필요" 플래그

---

## 5. Slack — 결재/보고

### 개요
에이전트 실행 결과 보고, 회장 결재 요청, 시스템 장애 알림 등의 커뮤니케이션 허브.

### 연동 상세
| 항목 | 내용 |
|------|------|
| **연동 프로토콜** | WebSocket (실시간) + Webhook (알림) |
| **MCP 서버 타입** | `slack-mcp-server` |
| **인증 방식** | OAuth 2.0 (Bot Token: `xoxb-...`) |
| **데이터 흐름** | 양방향 — 알림 발송 + 슬래시 커맨드/버튼 응답 수신 |
| **사용 파이프라인** | 전 파이프라인 공통 (알림/결재) |

### 채널 구조
| 채널 | 용도 |
|------|------|
| `#master-alerts` | 시스템 장애/긴급 알림 |
| `#master-approvals` | 회장 결재 요청 |
| `#master-reports` | 에이전트 실행 결과 보고 |
| `#[법인명]-ops` | 법인별 운영 알림 |

### 주요 API 호출
| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| POST | `/api/chat.postMessage` | 메시지 발송 |
| POST | `/api/files.upload` | 파일 첨부 (보고서 등) |
| POST | `/api/views.open` | 결재 모달 표시 |
| — | Webhook (Incoming) | 외부→Slack 알림 |

### 에러 시 폴백 전략
1. **1차**: Webhook 실패 시 Bot API로 대체 발송
2. **2차**: Slack 전체 장애 시 이메일 폴백 (SMTP)
3. **3차**: 로컬 감사 로그에 미전송 알림 큐잉

---

## 6. ChromaDB — RAG 벡터DB

### 개요
정부지원사업 자격 요건, SOP 매뉴얼, 과거 입찰 데이터 등을 벡터화하여 유사도 검색(RAG)을 수행.

### 연동 상세
| 항목 | 내용 |
|------|------|
| **연동 프로토콜** | Python Client (직접 연동) / HTTP API |
| **MCP 서버 타입** | 직접 연동 (MCP 불필요) |
| **인증 방식** | Internal (동일 네트워크 내 접근, 인증 불필요) |
| **데이터 흐름** | 양방향 — 문서 임베딩 저장 + 유사도 쿼리 |
| **사용 파이프라인** | Grant Factory (자격 대조), 전 스웜 (컨텍스트 조회) |

### 컬렉션 구조
| 컬렉션명 | 용도 |
|----------|------|
| `grant_requirements` | 정부지원사업 자격 요건 |
| `bid_history` | 과거 입찰 데이터 |
| `sop_manuals` | SOP 매뉴얼 |
| `legal_documents` | 법률/계약 문서 |
| `marketing_assets` | 마케팅 콘텐츠 아카이브 |

### 주요 API 호출
| 메서드 | 용도 |
|--------|------|
| `collection.add()` | 문서 임베딩 저장 |
| `collection.query()` | 유사도 검색 |
| `collection.update()` | 임베딩 업데이트 |
| `collection.delete()` | 임베딩 삭제 |

### 에러 시 폴백 전략
1. **1차**: 연결 재시도 (최대 3회, exponential backoff)
2. **2차**: 인메모리 캐시된 최근 결과 반환 (stale 허용)
3. **3차**: LLM 직접 추론으로 대체 (RAG 없이 응답)

---

## MCP 아키텍처 다이어그램

```
                    ┌─────────────────────┐
                    │   FastAPI Backend    │
                    │   (Orchestrator)     │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                   │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌───────▼───────┐
     │ MCP Client  │   │ MCP Client  │   │  Direct Client│
     │ Manager     │   │ Manager     │   │  (ChromaDB)   │
     └──────┬──────┘   └──────┬──────┘   └───────────────┘
            │                  │
   ┌────────┼────────┐        │
   │        │        │        │
┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐  ┌──────┐
│Fire │ │OCR  │ │Drive│ │Figma│  │Slack │
│Crawl│ │     │ │     │ │     │  │      │
└─────┘ └─────┘ └─────┘ └─────┘  └──────┘
```

## 공통 에러 처리 원칙

1. **Circuit Breaker**: 연속 5회 실패 시 해당 서비스 차단, 30초 후 half-open 시도
2. **감사 로깅**: 모든 MCP 호출은 감사 로그에 기록 (요청/응답/에러)
3. **시크릿 관리**: 모든 API 키는 Vault에서 주입, 환경변수 직접 노출 금지
4. **Rate Limiting**: 외부 서비스별 동시 호출 수 제한 (configurable)
