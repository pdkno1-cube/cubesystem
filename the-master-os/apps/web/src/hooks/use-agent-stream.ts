import { useState, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/nextjs';

interface StreamChunk {
  type: 'task_id' | 'text' | 'done' | 'error';
  task_id?: string;
  text?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  message?: string;
}

interface StreamState {
  taskId: string | null;
  output: string;
  isStreaming: boolean;
  isDone: boolean;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const INITIAL_STATE: StreamState = {
  taskId: null,
  output: '',
  isStreaming: false,
  isDone: false,
  error: null,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
};

export function useAgentStream(agentId: string) {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (inputText: string, workspaceId?: string, conversationId?: string) => {
      // Abort previous stream if any
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setState({ ...INITIAL_STATE, isStreaming: true });

      try {
        const res = await fetch(`/api/agents/${agentId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_text: inputText,
            workspace_id: workspaceId ?? null,
            conversation_id: conversationId ?? null,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          setState((s) => ({ ...s, isStreaming: false, error: errText }));
          return;
        }

        if (!res.body) {
          setState((s) => ({ ...s, isStreaming: false, error: 'No response body' }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) { continue; }
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) { continue; }

            try {
              const chunk = JSON.parse(jsonStr) as StreamChunk;

              if (chunk.type === 'task_id') {
                setState((s) => ({ ...s, taskId: chunk.task_id ?? null }));
              } else if (chunk.type === 'text') {
                setState((s) => ({ ...s, output: s.output + (chunk.text ?? '') }));
              } else if (chunk.type === 'done') {
                setState((s) => ({
                  ...s,
                  isStreaming: false,
                  isDone: true,
                  tokensIn: chunk.tokens_input ?? 0,
                  tokensOut: chunk.tokens_output ?? 0,
                  costUsd: chunk.cost_usd ?? 0,
                }));
              } else if (chunk.type === 'error') {
                setState((s) => ({
                  ...s,
                  isStreaming: false,
                  error: chunk.message ?? 'Unknown error',
                }));
              }
            } catch (parseErr) {
              Sentry.captureException(parseErr, { extra: { line } });
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setState((s) => ({ ...s, isStreaming: false }));
          return;
        }
        Sentry.captureException(err);
        setState((s) => ({
          ...s,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Execution failed',
        }));
      }
    },
    [agentId],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  return { ...state, execute, reset, stop };
}
