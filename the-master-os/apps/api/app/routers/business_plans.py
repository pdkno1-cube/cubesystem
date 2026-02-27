"""Business plan generation router — LLM 기반 사업계획서 자동 생성.

Endpoints:
  POST /orchestrate/business-plans/generate   LLM으로 사업계획서 9개 섹션 생성

Input: 회사명, 산업, 타겟시장, 회사설명, TAM/SAM/SOM, 경쟁사 등
Output: 9개 섹션 (executive_summary, problem, solution, market_analysis,
        competitors, business_model, financial_projection, team, timeline)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.llm.client import LLMClient, LLMResponse
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/business-plans", tags=["business-plans"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CompetitorInput(BaseModel):
    """경쟁사 입력."""

    name: str = ""
    strength: str = ""
    weakness: str = ""


class GenerateRequest(BaseModel):
    """사업계획서 생성 요청 본문."""

    company_name: str
    industry: str
    target_market: str
    company_description: str = ""
    tam_value: float = 0
    sam_value: float = 0
    som_value: float = 0
    competitors: list[CompetitorInput] = Field(default_factory=list)


class FinancialProjection(BaseModel):
    """3개년 재무 전망."""

    years: list[str] = Field(default_factory=lambda: ["1년차", "2년차", "3년차"])
    revenue: list[float] = Field(default_factory=lambda: [0, 0, 0])
    cost: list[float] = Field(default_factory=lambda: [0, 0, 0])
    profit: list[float] = Field(default_factory=lambda: [0, 0, 0])


class TimelineMilestone(BaseModel):
    """분기별 마일스톤."""

    quarter: str
    label: str


class MarketAnalysis(BaseModel):
    """시장 분석."""

    tam: float = 0
    sam: float = 0
    som: float = 0
    description: str = ""


class GeneratedSections(BaseModel):
    """LLM이 생성한 사업계획서 9개 섹션."""

    executive_summary: str = ""
    problem: str = ""
    solution: str = ""
    market_analysis: MarketAnalysis = Field(default_factory=MarketAnalysis)
    competitors: str = ""
    business_model: str = ""
    financial_projection: FinancialProjection = Field(default_factory=FinancialProjection)
    team: str = ""
    timeline: dict[str, list[dict[str, str]]] = Field(default_factory=lambda: {"milestones": []})


class GenerateResponse(BaseModel):
    """사업계획서 생성 응답."""

    sections: GeneratedSections
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float = 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_llm_client(request: Request) -> LLMClient:
    """Retrieve LLMClient from app.state."""
    client: LLMClient | None = getattr(request.app.state, "_llm_client", None)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "LLM_UNAVAILABLE",
                "message": "LLM client is not initialised",
            },
        )
    return client


def _format_krw(value: float) -> str:
    """한국 원화 포맷."""
    if value >= 1_000_000_000_000:
        return f"{value / 1_000_000_000_000:.1f}조원"
    if value >= 100_000_000:
        return f"{value / 100_000_000:.0f}억원"
    if value >= 10_000:
        return f"{value / 10_000:.0f}만원"
    return f"{value:.0f}원"


def _build_system_prompt() -> str:
    """사업계획서 생성용 시스템 프롬프트."""
    return """당신은 한국 스타트업 사업계획서 전문 작성 AI입니다.
사용자가 제공하는 회사 정보를 바탕으로 투자자 대상 사업계획서의 각 섹션을 한국어로 작성합니다.

반드시 아래 JSON 형식으로만 응답하세요. JSON 외의 텍스트는 포함하지 마세요.

{
  "executive_summary": "경영진 요약 (3-5문장)",
  "problem": "해결하려는 문제 (3-5문장)",
  "solution": "제안하는 솔루션 (3-5문장, 핵심 차별점 포함)",
  "market_analysis": {
    "tam": 숫자(원),
    "sam": 숫자(원),
    "som": 숫자(원),
    "description": "시장 분석 설명 (3-5문장)"
  },
  "competitors": "경쟁사 분석 (각 경쟁사별 강점/약점, 우리의 차별점)",
  "business_model": "비즈니스 모델 설명 (수익 구조, ARPU, LTV 등)",
  "financial_projection": {
    "years": ["1년차", "2년차", "3년차"],
    "revenue": [매출1, 매출2, 매출3],
    "cost": [비용1, 비용2, 비용3],
    "profit": [이익1, 이익2, 이익3]
  },
  "team": "팀 구성 설명 (각 핵심 멤버 역할과 경력)",
  "timeline": {
    "milestones": [
      {"quarter": "Q1", "label": "마일스톤 설명"},
      {"quarter": "Q2", "label": "마일스톤 설명"},
      {"quarter": "Q3", "label": "마일스톤 설명"},
      {"quarter": "Q4", "label": "마일스톤 설명"}
    ]
  }
}

주의사항:
- 모든 금액은 한국 원(KRW) 단위 숫자로 작성
- financial_projection의 revenue/cost/profit은 반드시 숫자 배열
- 사용자가 제공한 TAM/SAM/SOM 값이 있으면 그대로 사용하고, 0이면 산업에 맞게 추정
- 실현 가능하고 현실적인 수치를 제시
- JSON만 응답하고, 마크다운 코드블록(```)이나 설명 텍스트는 절대 포함하지 마세요"""


def _build_user_message(body: GenerateRequest) -> str:
    """사용자 메시지 구성."""
    competitors_text = ""
    if body.competitors:
        lines: list[str] = []
        for comp in body.competitors:
            parts = [f"- {comp.name}"]
            if comp.strength:
                parts.append(f"(강점: {comp.strength})")
            if comp.weakness:
                parts.append(f"(약점: {comp.weakness})")
            lines.append(" ".join(parts))
        competitors_text = "\n".join(lines)

    return f"""다음 회사 정보를 바탕으로 사업계획서를 작성해주세요.

회사명: {body.company_name}
산업: {body.industry}
타겟 시장: {body.target_market}
회사 설명: {body.company_description or '미입력'}
TAM (전체 시장): {_format_krw(body.tam_value) if body.tam_value else '미입력'}
SAM (서비스 가능 시장): {_format_krw(body.sam_value) if body.sam_value else '미입력'}
SOM (획득 가능 시장): {_format_krw(body.som_value) if body.som_value else '미입력'}
경쟁사:
{competitors_text or '미입력'}"""


def _extract_json_from_response(content: str) -> dict[str, Any]:
    """LLM 응답에서 JSON을 추출.

    마크다운 코드블록이나 앞뒤 텍스트가 포함되어 있어도 JSON만 추출한다.
    """
    # 마크다운 코드블록 제거
    code_block_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
    if code_block_match:
        content = code_block_match.group(1)

    # JSON 객체 추출 (첫 번째 { 부터 마지막 } 까지)
    brace_match = re.search(r"\{.*\}", content, re.DOTALL)
    if not brace_match:
        raise ValueError("LLM 응답에서 JSON 객체를 찾을 수 없습니다")

    return json.loads(brace_match.group(0))  # type: ignore[no-any-return]


def _parse_sections(raw: dict[str, Any], body: GenerateRequest) -> GeneratedSections:
    """LLM JSON 응답을 GeneratedSections로 안전하게 파싱."""
    # market_analysis
    raw_market = raw.get("market_analysis", {})
    if isinstance(raw_market, dict):
        market = MarketAnalysis(
            tam=float(raw_market.get("tam", body.tam_value)),
            sam=float(raw_market.get("sam", body.sam_value)),
            som=float(raw_market.get("som", body.som_value)),
            description=str(raw_market.get("description", "")),
        )
    else:
        market = MarketAnalysis(
            tam=body.tam_value,
            sam=body.sam_value,
            som=body.som_value,
            description=str(raw_market),
        )

    # financial_projection
    raw_fin = raw.get("financial_projection", {})
    if isinstance(raw_fin, dict):
        fin = FinancialProjection(
            years=raw_fin.get("years", ["1년차", "2년차", "3년차"]),
            revenue=[float(v) for v in raw_fin.get("revenue", [0, 0, 0])],
            cost=[float(v) for v in raw_fin.get("cost", [0, 0, 0])],
            profit=[float(v) for v in raw_fin.get("profit", [0, 0, 0])],
        )
    else:
        fin = FinancialProjection()

    # timeline
    raw_timeline = raw.get("timeline", {})
    if isinstance(raw_timeline, dict):
        milestones_raw = raw_timeline.get("milestones", [])
        milestones: list[dict[str, str]] = [
            {"quarter": str(m.get("quarter", "")), "label": str(m.get("label", ""))}
            for m in milestones_raw
            if isinstance(m, dict)
        ]
        timeline = {"milestones": milestones}
    else:
        timeline = {"milestones": []}

    return GeneratedSections(
        executive_summary=str(raw.get("executive_summary", "")),
        problem=str(raw.get("problem", "")),
        solution=str(raw.get("solution", "")),
        market_analysis=market,
        competitors=str(raw.get("competitors", "")),
        business_model=str(raw.get("business_model", "")),
        financial_projection=fin,
        team=str(raw.get("team", "")),
        timeline=timeline,
    )


def _generate_mock_sections(body: GenerateRequest) -> GeneratedSections:
    """API 키가 없을 때 사용하는 mock fallback."""
    return GeneratedSections(
        executive_summary=(
            f"{body.company_name}은(는) {body.industry} 산업에서 "
            f"{body.target_market}을(를) 대상으로 혁신적인 솔루션을 제공합니다. "
            f"{body.company_description}"
        ),
        problem=(
            f"{body.target_market} 시장에서 기존 솔루션은 비효율적이며, "
            "사용자 경험이 부족합니다. 현재 시장의 주요 문제점은 "
            "높은 비용, 복잡한 프로세스, 낮은 접근성입니다."
        ),
        solution=(
            f"{body.company_name}의 솔루션은 AI 기반 자동화와 직관적인 UX를 통해 "
            "기존 문제를 해결합니다. 핵심 차별점은 10배 빠른 처리 속도, "
            "50% 비용 절감, 원클릭 자동화입니다."
        ),
        market_analysis=MarketAnalysis(
            tam=body.tam_value,
            sam=body.sam_value,
            som=body.som_value,
            description=(
                f"{body.industry} 산업의 전체 시장(TAM)은 {_format_krw(body.tam_value)}이며, "
                f"서비스 가능 시장(SAM)은 {_format_krw(body.sam_value)}, "
                f"획득 가능 시장(SOM)은 {_format_krw(body.som_value)}입니다."
            ),
        ),
        competitors=(
            "주요 경쟁사 대비 AI 자동화 기술력과 사용자 경험에서 "
            "차별화된 경쟁 우위를 보유하고 있습니다."
        ),
        business_model=(
            "B2B SaaS 구독 모델을 기반으로, 월간/연간 구독료와 사용량 기반 과금을 "
            "병행합니다. 평균 고객 단가(ARPU)는 월 50만원이며, "
            "고객 생애 가치(LTV)는 1,800만원입니다."
        ),
        financial_projection=FinancialProjection(
            years=["1년차", "2년차", "3년차"],
            revenue=[500_000_000, 2_000_000_000, 5_000_000_000],
            cost=[800_000_000, 1_500_000_000, 2_500_000_000],
            profit=[-300_000_000, 500_000_000, 2_500_000_000],
        ),
        team=(
            f"창업자: CEO ({body.industry} 10년 경력)\n"
            "CTO: 기술 총괄 (AI/ML 전문가)\n"
            "CMO: 마케팅 총괄 (B2B SaaS 성장 전문)\n"
            "COO: 운영 총괄 (스타트업 스케일업 경험)"
        ),
        timeline={
            "milestones": [
                {"quarter": "Q1", "label": "MVP 출시 및 초기 고객 확보"},
                {"quarter": "Q2", "label": "제품 고도화 및 시리즈A 투자 유치"},
                {"quarter": "Q3", "label": "팀 확장 및 마케팅 본격화"},
                {"quarter": "Q4", "label": "해외 시장 진출 준비"},
            ],
        },
    )


def _has_llm_keys(settings: Settings) -> bool:
    """Anthropic 또는 OpenAI API 키가 설정되어 있는지 확인."""
    return bool(settings.anthropic_api_key) or bool(settings.openai_api_key)


# ---------------------------------------------------------------------------
# POST /orchestrate/business-plans/generate
# ---------------------------------------------------------------------------


@router.post(
    "/generate",
    response_model=BaseResponse[GenerateResponse],
    status_code=status.HTTP_200_OK,
    summary="LLM으로 사업계획서 9개 섹션 생성",
)
async def generate_business_plan(
    body: GenerateRequest,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[GenerateResponse]:
    """회사 정보를 입력받아 LLM으로 사업계획서를 생성한다.

    API 키가 없으면 mock fallback을 반환한다.
    """
    logger.info(
        "Business plan generation requested: company=%s industry=%s user=%s",
        body.company_name,
        body.industry,
        user.user_id,
    )

    # API 키 없으면 mock fallback
    if not _has_llm_keys(settings):
        logger.warning(
            "No LLM API key configured — returning mock business plan for company=%s",
            body.company_name,
        )
        sections = _generate_mock_sections(body)
        return BaseResponse(
            data=GenerateResponse(sections=sections, model="mock"),
            meta={"source": "mock"},
        )

    llm_client = _get_llm_client(request)

    # LLM provider 결정: Anthropic 우선, 없으면 OpenAI
    if settings.anthropic_api_key:
        provider = "anthropic"
        model = "claude-sonnet-4-20250514"
    else:
        provider = "openai"
        model = "gpt-4o"

    agent_row: dict[str, object] = {
        "model_provider": provider,
        "model": model,
        "system_prompt": _build_system_prompt(),
        "parameters": {
            "temperature": 0.7,
            "max_tokens": 4096,
            "top_p": 1.0,
        },
    }

    messages: list[dict[str, str]] = [
        {"role": "user", "content": _build_user_message(body)},
    ]

    try:
        llm_response: LLMResponse = await llm_client.invoke(agent_row, messages)
    except HTTPException:
        # LLM 호출 실패 시 mock fallback
        logger.warning(
            "LLM invocation failed — falling back to mock for company=%s",
            body.company_name,
            exc_info=True,
        )
        sections = _generate_mock_sections(body)
        return BaseResponse(
            data=GenerateResponse(sections=sections, model="mock-fallback"),
            meta={"source": "mock-fallback", "reason": "llm_invocation_failed"},
        )

    # LLM 응답 파싱
    try:
        raw_json = _extract_json_from_response(llm_response.content)
        sections = _parse_sections(raw_json, body)
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        sentry_sdk.capture_exception(exc)
        logger.error(
            "Failed to parse LLM response as JSON: %s — content preview: %s",
            exc,
            llm_response.content[:500],
        )
        # 파싱 실패 시 mock fallback
        sections = _generate_mock_sections(body)
        return BaseResponse(
            data=GenerateResponse(
                sections=sections,
                model=llm_response.model,
                input_tokens=llm_response.input_tokens,
                output_tokens=llm_response.output_tokens,
                cost=llm_response.cost,
            ),
            meta={"source": "mock-fallback", "reason": "json_parse_failed"},
        )

    return BaseResponse(
        data=GenerateResponse(
            sections=sections,
            model=llm_response.model,
            input_tokens=llm_response.input_tokens,
            output_tokens=llm_response.output_tokens,
            cost=llm_response.cost,
        ),
        meta={"source": "llm"},
    )
