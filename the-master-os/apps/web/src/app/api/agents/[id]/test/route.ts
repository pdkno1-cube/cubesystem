import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';

const testSchema = z.object({
  test_message: z.string().min(1).max(4000),
  system_prompt_override: z.string().min(1).optional(),
});

const TOKEN_COST_USD: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':   { input: 15   / 1_000_000, output: 75  / 1_000_000 },
  'claude-sonnet-4-6': { input: 3    / 1_000_000, output: 15  / 1_000_000 },
  'claude-haiku-4-5':  { input: 0.8  / 1_000_000, output: 4   / 1_000_000 },
  'gpt-4o':            { input: 5    / 1_000_000, output: 15  / 1_000_000 },
  'gpt-4o-mini':       { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
};

const DEFAULT_COST = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

// Anthropic REST API를 직접 호출 (SDK 없이)
async function invokeAnthropic(opts: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  apiKey: string;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1024,
      system: opts.systemPrompt,
      messages: [{ role: 'user', content: opts.userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API 오류 (${res.status}): ${errText.substring(0, 200)}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const firstBlock = data.content[0];
  return {
    content: firstBlock?.type === 'text' ? firstBlock.text : '',
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

// OpenAI REST API를 직접 호출 (SDK 없이)
async function invokeOpenAI(opts: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  apiKey: string;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API 오류 (${res.status}): ${errText.substring(0, 200)}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startMs = Date.now();

  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      );
    }

    const body: unknown = await request.json();
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, model, model_provider, system_prompt')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '에이전트를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    const systemPrompt = parsed.data.system_prompt_override ?? agent.system_prompt;
    const { test_message } = parsed.data;
    const model = agent.model;
    const provider = agent.model_provider;

    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;

    if (provider === 'anthropic') {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        return NextResponse.json(
          { error: { code: 'CONFIG_ERROR', message: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' } },
          { status: 503 }
        );
      }
      const result = await invokeAnthropic({ model, systemPrompt, userMessage: test_message, apiKey });
      content = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;

    } else if (provider === 'openai') {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        return NextResponse.json(
          { error: { code: 'CONFIG_ERROR', message: 'OPENAI_API_KEY가 설정되지 않았습니다.' } },
          { status: 503 }
        );
      }
      const result = await invokeOpenAI({ model, systemPrompt, userMessage: test_message, apiKey });
      content = result.content;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;

    } else {
      return NextResponse.json(
        { error: { code: 'UNSUPPORTED_PROVIDER', message: `'${provider}' 프로바이더는 테스트를 지원하지 않습니다.` } },
        { status: 400 }
      );
    }

    const costTable = TOKEN_COST_USD[model] ?? DEFAULT_COST;
    const cost = inputTokens * costTable.input + outputTokens * costTable.output;
    const elapsedMs = Date.now() - startMs;

    return NextResponse.json({
      data: { content, tokens: { input: inputTokens, output: outputTokens }, cost, model, elapsed_ms: elapsedMs },
    });

  } catch (error) {
    return handleApiError(error, 'agents-id-test.POST');
  }
}
