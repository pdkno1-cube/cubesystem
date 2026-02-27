"""AI-powered debate message generation router.

Generates debate messages from multiple agent perspectives (optimist, pessimist,
realist, critic) using the LLM client. Falls back to simulation messages when
no LLM API keys are configured.

Endpoints:
  POST /orchestrate/debates/generate-messages — Generate a round of debate messages
"""

from __future__ import annotations

import logging
import random
from typing import Literal

import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.llm import LLMClient, LLMResponse
from app.schemas.common import BaseResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/debates", tags=["debates"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

AgentRole = Literal["optimist", "pessimist", "realist", "critic"]


class DebateAgent(BaseModel):
    """An agent participating in the debate."""

    agent_id: str
    agent_role: AgentRole
    agent_name: str


class GenerateMessagesRequest(BaseModel):
    """Request body for generating a round of debate messages."""

    topic: str = Field(..., min_length=1, max_length=500)
    debate_id: str
    agents: list[DebateAgent] = Field(..., min_length=1, max_length=8)
    previous_messages: list[dict[str, str]] = Field(
        default_factory=list,
        description="Previous debate messages for context [{agent_name, agent_role, content}]",
    )
    round_number: int = Field(default=1, ge=1)
    start_sequence_order: int = Field(
        default=0,
        description="Starting sequence_order for this round's messages",
    )


class GeneratedMessage(BaseModel):
    """A single generated debate message."""

    agent_id: str
    agent_role: AgentRole
    message_content: str
    reasoning: str
    confidence_score: float = Field(ge=0.0, le=1.0)


class GenerateMessagesResponse(BaseModel):
    """Response containing generated debate messages."""

    messages: list[GeneratedMessage]
    round_number: int
    llm_used: bool


# ---------------------------------------------------------------------------
# Role-specific system prompts (Korean)
# ---------------------------------------------------------------------------

_ROLE_SYSTEM_PROMPTS: dict[str, str] = {
    "optimist": (
        "당신은 토론에서 '낙관론자' 역할입니다. "
        "주어진 주제에 대해 긍정적이고 희망적인 관점에서 논거를 제시하세요. "
        "기회, 잠재적 이점, 성장 가능성에 초점을 맞추세요. "
        "구체적인 근거와 데이터를 들어 설명하되, 지나친 낙관은 피하세요."
    ),
    "pessimist": (
        "당신은 토론에서 '비관론자' 역할입니다. "
        "주어진 주제에 대해 우려되는 점과 잠재적 위험을 지적하세요. "
        "리스크, 부정적 결과, 실패 가능성에 초점을 맞추세요. "
        "구체적인 근거와 사례를 들어 설명하되, 건설적인 비판을 유지하세요."
    ),
    "realist": (
        "당신은 토론에서 '현실주의자' 역할입니다. "
        "주어진 주제에 대해 균형 잡힌 시각으로 현실적인 분석을 제공하세요. "
        "데이터 기반의 객관적 판단, 실행 가능성, 현실적 제약 조건에 초점을 맞추세요. "
        "양쪽의 의견을 참고하되 실용적인 관점에서 종합하세요."
    ),
    "critic": (
        "당신은 토론에서 '비평가' 역할입니다. "
        "다른 참가자들의 논리적 허점과 약점을 지적하세요. "
        "논증의 일관성, 증거의 신뢰성, 논리적 오류에 초점을 맞추세요. "
        "건설적인 비평을 통해 토론의 질을 높이는 역할을 하세요."
    ),
}

# Fallback simulation messages when LLM keys are unavailable
_SIMULATION_TEMPLATES: dict[str, list[str]] = {
    "optimist": [
        '"{topic}" 주제에 대해 긍정적으로 바라봅니다. 이 방향은 큰 성장 기회를 제공하며, '
        "특히 혁신적인 접근법을 통해 시장에서 차별화된 위치를 확보할 수 있습니다. "
        "선도적인 기업들의 성공 사례를 보면 이러한 전략이 평균 30% 이상의 성과 향상을 가져왔습니다.",
        '"{topic}"은(는) 우리에게 새로운 가능성을 열어줄 것입니다. '
        "기술 발전의 속도와 시장 수요를 고려하면, 지금이 최적의 타이밍입니다. "
        "조기 진입자의 이점을 활용하여 경쟁 우위를 확보할 수 있습니다.",
    ],
    "pessimist": [
        '"{topic}" 주제에 대해 심각한 우려가 있습니다. '
        "시장 불확실성이 높고, 투자 대비 수익 회수 기간이 길어질 수 있습니다. "
        "유사한 시도의 실패 사례를 분석하면, 70%가 초기 3년 내 목표를 달성하지 못했습니다.",
        '"{topic}"의 리스크를 과소평가해서는 안 됩니다. '
        "경쟁이 치열해지고 있고, 기술적 장벽도 무시할 수 없습니다. "
        "예상치 못한 규제 변화나 시장 변동성에 대한 대비가 부족합니다.",
    ],
    "realist": [
        '"{topic}"을(를) 객관적으로 분석하면, 기회와 위험이 공존합니다. '
        "현재 시장 데이터를 기준으로 보면, 단계적 접근이 가장 합리적입니다. "
        "1단계: 파일럿 테스트, 2단계: 데이터 검증, 3단계: 확장의 순서로 진행해야 합니다.",
        '"{topic}"에 대해 현실적으로 판단하면, '
        "성공 가능성은 있지만 리소스와 시간 투자에 대한 현실적 계획이 필요합니다. "
        "벤치마크 분석을 통해 목표치를 설정하고, 분기별 KPI로 진행 상황을 관리해야 합니다.",
    ],
    "critic": [
        '지금까지의 논의에서 몇 가지 논리적 허점이 보입니다. "{topic}"에 대한 '
        "긍정론은 성공 사례만 선택적으로 인용하고 있고, 비관론은 최악의 시나리오에 지나치게 편향되어 있습니다. "
        "양측 모두 데이터의 대표성과 시간 범위를 재검토해야 합니다.",
        '"{topic}" 논의에서 빠진 중요한 관점이 있습니다. '
        "경제적 분석에 그치지 않고 사회적/기술적/법적 측면도 종합적으로 고려해야 합니다. "
        "또한 장기적 영향과 단기적 성과를 분리하여 평가해야 합니다.",
    ],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_user_prompt(
    topic: str,
    agent: DebateAgent,
    previous_messages: list[dict[str, str]],
    round_number: int,
) -> str:
    """Build a user-level prompt with topic and conversation context."""
    parts: list[str] = [f"토론 주제: {topic}\n"]

    if previous_messages:
        parts.append("=== 이전 토론 내용 ===")
        for msg in previous_messages:
            parts.append(
                f"[{msg.get('agent_role', '참여자')}] {msg.get('agent_name', '에이전트')}: "
                f"{msg.get('content', '')}"
            )
        parts.append("=== 이전 내용 끝 ===\n")

    parts.append(
        f"라운드 {round_number}: "
        f"'{agent.agent_role}' 역할로서 위 주제에 대한 당신의 의견을 150~300자 한국어로 작성하세요. "
        "반드시 아래 JSON 형식으로 응답하세요:\n"
        '{"message": "토론 메시지 내용", "reasoning": "이 의견의 근거/추론 과정", '
        '"confidence": 0.0~1.0 사이의 확신도}'
    )

    return "\n".join(parts)


def _parse_llm_response(raw: str) -> tuple[str, str, float]:
    """Extract message, reasoning, and confidence from LLM response.

    Tries JSON parsing first, falls back to treating the whole response as message.
    """
    import json

    # Attempt to extract JSON from the response
    try:
        # Try direct JSON parse
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            message = str(parsed.get("message", raw))
            reasoning = str(parsed.get("reasoning", ""))
            confidence = float(parsed.get("confidence", 0.7))
            return message, reasoning, min(max(confidence, 0.0), 1.0)
    except (json.JSONDecodeError, ValueError):
        pass

    # Try to find JSON within the text
    try:
        start = raw.index("{")
        end = raw.rindex("}") + 1
        parsed = json.loads(raw[start:end])
        if isinstance(parsed, dict):
            message = str(parsed.get("message", raw))
            reasoning = str(parsed.get("reasoning", ""))
            confidence = float(parsed.get("confidence", 0.7))
            return message, reasoning, min(max(confidence, 0.0), 1.0)
    except (ValueError, json.JSONDecodeError):
        pass

    # Fallback: use entire response as message
    return raw.strip(), "LLM 응답에서 구조화된 추론을 추출하지 못했습니다.", 0.6


def _generate_simulation_message(
    topic: str,
    agent: DebateAgent,
    previous_messages: list[dict[str, str]],
    round_number: int,
) -> GeneratedMessage:
    """Generate a simulated message when LLM is unavailable."""
    templates = _SIMULATION_TEMPLATES.get(agent.agent_role, _SIMULATION_TEMPLATES["realist"])
    template = random.choice(templates)  # noqa: S311 -- not security-critical
    message_content = template.format(topic=topic)

    # Add round awareness for rounds > 1
    if round_number > 1 and previous_messages:
        message_content += (
            f"\n\n(라운드 {round_number}: 이전 논의를 참고하여 의견을 발전시킵니다.)"
        )

    confidence = round(random.uniform(0.5, 0.9), 2)  # noqa: S311

    return GeneratedMessage(
        agent_id=agent.agent_id,
        agent_role=agent.agent_role,
        message_content=message_content,
        reasoning=f"시뮬레이션 모드 (LLM 미연결) — 라운드 {round_number}, 역할: {agent.agent_role}",
        confidence_score=confidence,
    )


def _has_llm_keys(settings: Settings) -> bool:
    """Check if at least one LLM provider API key is configured."""
    return bool(settings.anthropic_api_key) or bool(settings.openai_api_key)


# ---------------------------------------------------------------------------
# POST /orchestrate/debates/generate-messages
# ---------------------------------------------------------------------------


@router.post(
    "/generate-messages",
    response_model=BaseResponse[GenerateMessagesResponse],
    summary="Generate a round of AI debate messages",
)
async def generate_debate_messages(
    body: GenerateMessagesRequest,
    settings: Settings = Depends(get_settings),
) -> BaseResponse[GenerateMessagesResponse]:
    """Generate one debate message per agent for the current round.

    Uses the configured LLM provider (Anthropic or OpenAI) to produce
    role-appropriate messages. Falls back to simulation templates when
    no API keys are available.
    """
    logger.info(
        "Debate message generation requested: debate_id=%s topic=%s agents=%d round=%d",
        body.debate_id,
        body.topic[:50],
        len(body.agents),
        body.round_number,
    )

    messages: list[GeneratedMessage] = []
    llm_used = False

    if _has_llm_keys(settings):
        # Use real LLM
        llm_client = LLMClient(_settings=settings)
        llm_used = True

        # Determine which provider/model to use
        if settings.anthropic_api_key:
            model_provider = "anthropic"
            model = "claude-haiku-3-20250310"
        else:
            model_provider = "openai"
            model = "gpt-4o-mini"

        for agent in body.agents:
            system_prompt = _ROLE_SYSTEM_PROMPTS.get(
                agent.agent_role, _ROLE_SYSTEM_PROMPTS["realist"]
            )
            user_prompt = _build_user_prompt(
                body.topic, agent, body.previous_messages, body.round_number,
            )

            agent_row: dict[str, object] = {
                "model_provider": model_provider,
                "model": model,
                "system_prompt": system_prompt,
                "parameters": {
                    "temperature": 0.8,
                    "max_tokens": 1024,
                    "top_p": 0.95,
                },
            }

            try:
                llm_response: LLMResponse = await llm_client.invoke(
                    agent_row,
                    [{"role": "user", "content": user_prompt}],
                )
                message_content, reasoning, confidence = _parse_llm_response(
                    llm_response.content,
                )
                messages.append(
                    GeneratedMessage(
                        agent_id=agent.agent_id,
                        agent_role=agent.agent_role,
                        message_content=message_content,
                        reasoning=reasoning,
                        confidence_score=confidence,
                    )
                )
            except HTTPException:
                # LLM provider error -- fall back to simulation for this agent
                logger.warning(
                    "LLM invocation failed for agent %s, using simulation fallback",
                    agent.agent_id,
                )
                sentry_sdk.capture_message(
                    f"Debate LLM fallback: agent={agent.agent_id}",
                    level="warning",
                )
                messages.append(
                    _generate_simulation_message(
                        body.topic, agent, body.previous_messages, body.round_number,
                    )
                )
                llm_used = False
            except Exception as exc:
                logger.exception(
                    "Unexpected error generating debate message for agent %s",
                    agent.agent_id,
                )
                sentry_sdk.capture_exception(exc)
                messages.append(
                    _generate_simulation_message(
                        body.topic, agent, body.previous_messages, body.round_number,
                    )
                )
                llm_used = False
    else:
        # No LLM keys -- full simulation mode
        logger.info("No LLM keys configured; using simulation mode for debate")
        for agent in body.agents:
            messages.append(
                _generate_simulation_message(
                    body.topic, agent, body.previous_messages, body.round_number,
                )
            )

    response = GenerateMessagesResponse(
        messages=messages,
        round_number=body.round_number,
        llm_used=llm_used,
    )

    return BaseResponse(data=response)
