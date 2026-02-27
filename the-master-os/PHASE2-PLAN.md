# Phase 2: Agent Execution & Pipeline Engine

## 현재 상태 (Phase 1 완료)

| 완료 | 항목 |
|------|------|
| ✅ | DB 12테이블 + RLS + 마이그레이션 8개 |
| ✅ | Next.js CRUD API 16개 라우트 |
| ✅ | 대시보드 UI 9페이지 + God Mode Canvas |
| ✅ | Supabase Auth (Email + Google OAuth) |
| ✅ | Zustand 스토어 (agent, workspace, auth) |
| ✅ | FastAPI 스켈레톤 (미들웨어 5개, 라우터 2개) |
| ✅ | Vercel 프로덕션 배포 |
| ❌ | **에이전트 실행 (LLM 호출) — 없음** |
| ❌ | **파이프라인 엔진 (LangGraph) — 없음** |
| ❌ | **실시간 WebSocket — 없음** |
| ❌ | **크레딧 차감 — 없음** |
| ❌ | **MCP 연동 — 없음** |

---

## Phase 2 아키텍처

```
┌─────────────────────────────────────────────────────┐
│  Next.js (Vercel)                                   │
│  ├─ Dashboard UI (React Flow, Zustand)              │
│  ├─ CRUD API Routes (/api/*)                        │
│  └─ WebSocket Client (useExecutionWS hook)          │
└──────────────┬──────────────────────────────────────┘
               │ REST + WebSocket
┌──────────────▼──────────────────────────────────────┐
│  FastAPI (apps/api)                                 │
│  ├─ POST /orchestrate/pipeline/start                │
│  ├─ POST /orchestrate/agent/invoke                  │
│  ├─ WS   /ws/execution/{id}                         │
│  ├─ LangGraph Engine (graph_definition → StateGraph) │
│  ├─ LLM Client (Anthropic + OpenAI)                 │
│  ├─ MCP Registry (FireCrawl, PaddleOCR, etc.)       │
│  └─ Credit Billing                                  │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│  Supabase (PostgreSQL + Auth + Storage)             │
│  ├─ pipeline_executions (상태 추적)                  │
│  ├─ pipeline_steps (단계별 기록)                     │
│  ├─ credits (차감 기록)                              │
│  ├─ audit_logs (감사 기록)                           │
│  └─ secret_vault (MCP API 키 암호화 저장)            │
└─────────────────────────────────────────────────────┘
```

---

## 작업 패키지 (6개 — Claude 2 분배용)

### WP-1: LLM Client + Agent Invoke (핵심)

**목표**: 에이전트가 실제 LLM을 호출하여 응답을 생성하는 기능

**파일 생성/수정**:
```
apps/api/app/llm/__init__.py          (새로 생성)
apps/api/app/llm/client.py            (새로 생성)
apps/api/app/llm/prompt_builder.py    (새로 생성)
apps/api/app/routers/agents.py        (수정 - 501 → 실제 구현)
apps/api/pyproject.toml               (수정 - anthropic, openai SDK 추가)
```

**구현 내용**:
```python
# apps/api/app/llm/client.py
class LLMClient:
    """멀티 프로바이더 LLM 클라이언트"""

    async def invoke(self, agent: AgentRow, messages: list[dict]) -> LLMResponse:
        """agent.model_provider에 따라 Anthropic/OpenAI 호출"""
        if agent.model_provider == 'anthropic':
            return await self._call_anthropic(agent, messages)
        elif agent.model_provider == 'openai':
            return await self._call_openai(agent, messages)

    async def _call_anthropic(self, agent, messages) -> LLMResponse:
        response = await self.anthropic.messages.create(
            model=agent.model,  # 'claude-sonnet-4-20250514'
            max_tokens=agent.parameters.get('max_tokens', 4096),
            temperature=agent.parameters.get('temperature', 0.7),
            system=agent.system_prompt,
            messages=messages
        )
        return LLMResponse(
            content=response.content[0].text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            model=agent.model,
            cost=self._calculate_cost(response.usage, agent.model)
        )
```

**환경변수 필요**:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`

**테스트 방법**:
```bash
curl -X POST http://localhost:8000/orchestrate/agent/invoke \
  -H "Authorization: Bearer <jwt>" \
  -d '{"agent_id": "20000000-...-000001", "messages": [{"role":"user","content":"테스트"}]}'
```

---

### WP-2: LangGraph Pipeline Engine (핵심)

**목표**: pipeline.graph_definition JSON을 파싱하여 LangGraph StateGraph로 변환하고 실행

**파일 생성/수정**:
```
apps/api/app/pipeline/__init__.py         (새로 생성)
apps/api/app/pipeline/engine.py           (새로 생성)
apps/api/app/pipeline/graph_builder.py    (새로 생성)
apps/api/app/pipeline/node_handlers.py    (새로 생성)
apps/api/app/pipeline/state.py            (새로 생성)
apps/api/app/routers/pipelines.py         (수정 - 501 → 실제 구현)
apps/api/pyproject.toml                   (수정 - langgraph 추가)
```

**graph_definition JSON 예시** (DB에 이미 저장됨):
```json
{
  "nodes": [
    {"id": "validate_input", "type": "validation", "label": "입력 검증"},
    {"id": "analyze_eligibility", "type": "agent_call", "label": "적합성 분석"},
    {"id": "generate_documents", "type": "agent_call", "label": "서류 생성"}
  ],
  "edges": [
    {"from": "validate_input", "to": "analyze_eligibility"},
    {"from": "analyze_eligibility", "to": "generate_documents"}
  ],
  "entry_point": "validate_input"
}
```

**구현 내용**:
```python
# apps/api/app/pipeline/graph_builder.py
from langgraph.graph import StateGraph, END

class PipelineGraphBuilder:
    """graph_definition JSON → LangGraph StateGraph 변환"""

    def build(self, pipeline: PipelineRow, llm_client: LLMClient) -> StateGraph:
        graph = StateGraph(PipelineState)

        for node in pipeline.graph_definition['nodes']:
            handler = self._get_node_handler(node['type'])
            graph.add_node(node['id'], handler)

        for edge in pipeline.graph_definition['edges']:
            graph.add_edge(edge['from'], edge['to'])

        graph.set_entry_point(pipeline.graph_definition['entry_point'])
        # 마지막 노드 → END
        graph.add_edge(terminal_node_id, END)

        return graph.compile()

# apps/api/app/pipeline/node_handlers.py
# 노드 타입별 핸들러
async def handle_agent_call(state: PipelineState) -> PipelineState:
    """agent_call 노드: LLM 호출"""
    agent = await fetch_agent(state.current_node.agent_slug)
    response = await llm_client.invoke(agent, state.messages)
    state.results[state.current_node_id] = response
    return state

async def handle_validation(state: PipelineState) -> PipelineState:
    """validation 노드: 입력 검증"""
    ...

async def handle_human_gate(state: PipelineState) -> PipelineState:
    """human_gate 노드: 회장 승인 대기 (Auto-Healing용)"""
    state.status = 'awaiting_approval'
    # WebSocket으로 승인 요청 알림 전송
    ...
```

**DB 기록**:
- 실행 시작 → `pipeline_executions` INSERT (status='running')
- 각 노드 완료 → `pipeline_steps` INSERT
- 실행 완료 → `pipeline_executions` UPDATE (status='completed')

**의존성**: WP-1 (LLM Client) 필수

---

### WP-3: FastAPI WebSocket 실시간 (프론트 + 백엔드)

**목표**: 파이프라인 실행 진행률을 실시간으로 UI에 표시

**파일 생성/수정**:
```
# Backend (FastAPI)
apps/api/app/ws/__init__.py                    (새로 생성)
apps/api/app/ws/connection_manager.py          (새로 생성)
apps/api/app/ws/execution_ws.py                (새로 생성)
apps/api/app/main.py                           (수정 - WS 라우트 등록)

# Frontend (Next.js)
apps/web/src/hooks/use-execution-ws.ts         (새로 생성)
apps/web/src/stores/execution-store.ts         (새로 생성)
apps/web/src/app/(dashboard)/pipelines/page.tsx  (수정 - 실행 UI 추가)
```

**구현 내용**:
```python
# apps/api/app/ws/connection_manager.py
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}  # execution_id → connections

    async def broadcast(self, execution_id: str, message: dict):
        for ws in self.active.get(execution_id, []):
            await ws.send_json(message)

# apps/api/app/ws/execution_ws.py
@router.websocket("/ws/execution/{execution_id}")
async def execution_ws(execution_id: str, websocket: WebSocket):
    await manager.connect(execution_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        manager.disconnect(execution_id, websocket)
```

```typescript
// apps/web/src/hooks/use-execution-ws.ts
export function useExecutionWS(executionId: string | null) {
  const [steps, setSteps] = useState<StepUpdate[]>([]);
  const [status, setStatus] = useState<'idle'|'running'|'completed'|'failed'>('idle');

  useEffect(() => {
    if (!executionId) return;
    const ws = new WebSocket(`${WS_URL}/ws/execution/${executionId}`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'step_complete') setSteps(prev => [...prev, msg]);
      if (msg.type === 'execution_complete') setStatus(msg.status);
    };
    return () => ws.close();
  }, [executionId]);

  return { steps, status };
}
```

**WS 메시지 형식**:
```json
{"type": "step_start",    "node_id": "validate_input", "label": "입력 검증"}
{"type": "step_complete",  "node_id": "validate_input", "duration_ms": 120}
{"type": "agent_streaming", "node_id": "analyze_eligibility", "chunk": "분석 결과..."}
{"type": "execution_complete", "status": "completed", "total_cost": 0.15}
```

---

### WP-4: 파이프라인 실행 UI (프론트엔드)

**목표**: 파이프라인 시작/모니터링/결과 확인 UI

**파일 생성/수정**:
```
apps/web/src/app/(dashboard)/pipelines/page.tsx              (수정 - "Phase 2" 제거)
apps/web/src/app/(dashboard)/pipelines/pipeline-card.tsx     (새로 생성)
apps/web/src/app/(dashboard)/pipelines/execution-panel.tsx   (새로 생성)
apps/web/src/app/(dashboard)/pipelines/execution-steps.tsx   (새로 생성)
apps/web/src/app/(dashboard)/pipelines/start-dialog.tsx      (새로 생성)
apps/web/src/stores/execution-store.ts                       (새로 생성)
```

**UI 구성**:
```
┌─────────────────────────────────────────────┐
│ Pipelines                    [+ 새 파이프라인] │
├─────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │Grant    │ │Document │ │OSMU     │        │
│ │Factory  │ │Verify   │ │Marketing│ ...    │
│ │▶ 실행   │ │▶ 실행   │ │▶ 실행   │        │
│ └─────────┘ └─────────┘ └─────────┘        │
├─────────────────────────────────────────────┤
│ 실행 모니터 (WebSocket 실시간)               │
│ ┌───────────────────────────────────────┐   │
│ │ ✅ 입력 검증 (120ms)                  │   │
│ │ ✅ 공고 수집 (2.3s)                   │   │
│ │ ⏳ 적합성 분석 중...                   │   │
│ │ ⬜ 서류 생성                          │   │
│ │ ⬜ 서류 검토                          │   │
│ │ ⬜ 최종 결과 저장                     │   │
│ └───────────────────────────────────────┘   │
│ 총 비용: ₩150 | 소요시간: 12.5초           │
└─────────────────────────────────────────────┘
```

**의존성**: WP-3 (WebSocket hook)

---

### WP-5: Credit Billing + Audit (백엔드)

**목표**: 파이프라인 실행 시 크레딧 차감 + 감사 로그 자동 기록

**파일 생성/수정**:
```
apps/api/app/billing/__init__.py       (새로 생성)
apps/api/app/billing/credits.py        (새로 생성)
apps/api/app/billing/cost_calculator.py (새로 생성)
apps/web/src/app/api/credits/route.ts  (수정 - 잔액 조회 개선)
```

**구현 내용**:
```python
# apps/api/app/billing/credits.py
class CreditService:
    async def deduct(self, workspace_id: str, amount: float,
                     execution_id: str, description: str) -> CreditTransaction:
        """크레딧 차감 + audit_logs 기록"""
        # 1. 현재 잔액 조회
        balance = await self._get_balance(workspace_id)
        if balance < amount:
            raise InsufficientCreditsError(balance, amount)

        # 2. credits 테이블 INSERT (type='usage', amount=-amount)
        tx = await supabase.from_('credits').insert({
            'workspace_id': workspace_id,
            'type': 'usage',
            'amount': -amount,
            'description': description,
            'reference_id': execution_id,
            'reference_type': 'pipeline_execution'
        }).execute()

        # 3. audit_logs 기록
        await supabase.from_('audit_logs').insert({
            'workspace_id': workspace_id,
            'action': 'credits.deducted',
            'category': 'billing',
            'details': {'amount': amount, 'execution_id': execution_id}
        }).execute()

        return tx

# apps/api/app/billing/cost_calculator.py
class CostCalculator:
    """에이전트별 cost_per_run + 토큰 비용 계산"""

    def calculate(self, agent: AgentRow, usage: TokenUsage) -> float:
        base_cost = agent.cost_per_run  # DB에 저장된 기본 비용
        token_cost = self._token_pricing(agent.model, usage)
        return base_cost + token_cost

    def _token_pricing(self, model: str, usage: TokenUsage) -> float:
        PRICING = {
            'claude-sonnet-4-20250514': {'input': 3.0/1M, 'output': 15.0/1M},
            'gpt-4o': {'input': 2.5/1M, 'output': 10.0/1M},
        }
        ...
```

---

### WP-6: MCP Registry + Secret Vault (백엔드)

**목표**: 외부 도구 (FireCrawl, PaddleOCR, Google Drive) 연동 + API 키 암호화 관리

**파일 생성/수정**:
```
apps/api/app/mcp/__init__.py           (새로 생성)
apps/api/app/mcp/registry.py           (새로 생성)
apps/api/app/mcp/firecrawl.py          (새로 생성)
apps/api/app/mcp/paddleocr.py          (새로 생성)
apps/api/app/mcp/google_drive.py       (새로 생성)
apps/api/app/security/vault.py         (새로 생성)
```

**구현 내용**:
```python
# apps/api/app/mcp/registry.py
class MCPRegistry:
    """파이프라인 노드에서 MCP 도구 호출"""

    def __init__(self, vault: SecretVault):
        self.vault = vault
        self._clients: dict[str, MCPClient] = {}

    async def get_client(self, mcp_name: str, workspace_id: str) -> MCPClient:
        api_key = await self.vault.get_secret(workspace_id, f'mcp_{mcp_name}_key')
        if mcp_name == 'firecrawl':
            return FireCrawlClient(api_key)
        elif mcp_name == 'paddleocr':
            return PaddleOCRClient(api_key)
        ...

    async def execute_tool(self, mcp_name: str, workspace_id: str, params: dict) -> dict:
        client = await self.get_client(mcp_name, workspace_id)
        return await client.execute(params)
```

**참고**: `secret_vault` 테이블과 `mcp_connections` 테이블은 이미 DB에 존재

---

## 의존성 그래프

```
WP-1 (LLM Client) ──────┐
                         ├──→ WP-2 (Pipeline Engine) ──→ WP-4 (Pipeline UI)
WP-6 (MCP + Vault) ─────┘           │
                                     ├──→ WP-5 (Credit Billing)
WP-3 (WebSocket) ───────────────────┘
```

## Claude 2 작업 분배 권장

### 병렬 실행 가능 (독립 작업)
| 작업자 | 패키지 | 예상 규모 |
|--------|--------|-----------|
| Claude A | **WP-1** LLM Client + Agent Invoke | 파일 5개, ~300줄 |
| Claude B | **WP-3** WebSocket 실시간 | 파일 6개, ~250줄 |
| Claude C | **WP-6** MCP Registry + Vault | 파일 6개, ~250줄 |
| Claude D | **WP-5** Credit Billing | 파일 3개, ~150줄 |

### 순차 실행 (의존성)
| 순서 | 패키지 | 선행 조건 |
|------|--------|-----------|
| 1차 | WP-1 + WP-3 + WP-5 + WP-6 (병렬) | 없음 |
| 2차 | **WP-2** Pipeline Engine | WP-1, WP-6 완료 |
| 3차 | **WP-4** Pipeline UI | WP-2, WP-3 완료 |

---

## 환경변수 (Phase 2에서 추가 필요)

```env
# LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# MCP
FIRECRAWL_API_KEY=...
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=...

# FastAPI
FASTAPI_URL=http://localhost:8000
WS_URL=ws://localhost:8000

# Redis (Supabase Realtime 대신 사용 시)
REDIS_URL=redis://localhost:6379
```

---

## 시드 에이전트 & 파이프라인 매핑

### Grant Factory 실행 흐름
```
입력: "정부조달 공고 검색: AI 솔루션"
  │
  ▼ validate_input
  │ → 입력 형식 검증
  ▼ crawl_announcements (MCP: FireCrawl)
  │ → 나라장터 공고 크롤링
  ▼ analyze_eligibility (Agent: OptimistAgent + CriticAgent)
  │ → 낙관론자: 기회 분석 / 비관론자: 리스크 분석
  ▼ generate_documents (Agent: BlogAgent)
  │ → 입찰서류 초안 생성
  ▼ review_documents (Agent: RealistAgent)
  │ → 최종 검토 및 균형 잡힌 판단
  ▼ finalize
    → 결과 저장 + 감사 로그 + 크레딧 차감
```

### Auto-Healing 실행 흐름 (human_gate 포함)
```
감지: API 키 만료 알림
  │
  ▼ detect_issue (Trigger)
  ▼ diagnose (Agent: COOAgent)
  │ → 원인 분석
  ▼ plan_recovery (Agent: COOAgent)
  │ → 복구 계획 수립
  ▼ review_plan (Agent: CriticAgent)
  │ → 복구 계획 비판적 검토
  ▼ await_approval ⏸️ [HUMAN GATE]
  │ → 회장 승인 대기 (WebSocket 알림)
  │ → 회장이 승인 버튼 클릭
  ▼ execute_recovery
  ▼ verify_recovery
  ▼ notify (MCP: Slack)
    → 결과 알림
```
