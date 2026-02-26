"""Prompt builder utilities for agent invocation.

Constructs the message list expected by LLM providers from
a system prompt, optional context dict, and user input.
"""

from __future__ import annotations

import json


def build_messages(
    system_prompt: str,
    user_input: str,
    context: dict[str, object] | None = None,
) -> list[dict[str, str]]:
    """Build an LLM-ready message list.

    The system prompt and optional context are merged into a single
    system-level preamble.  The user's input becomes the first user
    message.

    Args:
        system_prompt: Base system prompt from the agent configuration.
        user_input: The user's message / query.
        context: Optional dict of additional context (e.g. workspace info,
            previous step output) that is appended to the system prompt.

    Returns:
        A list of ``{"role": ..., "content": ...}`` message dicts
        suitable for both Anthropic and OpenAI APIs.
    """
    system_parts: list[str] = [system_prompt]

    if context:
        context_block = json.dumps(context, ensure_ascii=False, indent=2)
        system_parts.append(f"\n\n--- Context ---\n{context_block}")

    combined_system = "".join(system_parts)

    messages: list[dict[str, str]] = []

    if combined_system.strip():
        messages.append({"role": "system", "content": combined_system})

    messages.append({"role": "user", "content": user_input})

    return messages
