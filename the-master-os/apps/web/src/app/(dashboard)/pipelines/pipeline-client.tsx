'use client';

import { useState, useCallback } from 'react';
import { GitBranch } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useExecutionStore } from '@/stores/execution-store';
import { useExecutionWS } from '@/hooks/use-execution-ws';
import { createClient } from '@/lib/supabase/client';
import { PipelineCard } from './pipeline-card';
import { StartDialog } from './start-dialog';
import { ExecutionPanel } from './execution-panel';
import { PageHero } from '@/components/ui/PageHero';
import type { PipelineWithMeta } from './page';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimpleWorkspace {
  id: string;
  name: string;
  slug: string;
}

interface PipelineClientProps {
  initialPipelines: PipelineWithMeta[];
  workspaces: SimpleWorkspace[];
}

interface ExecuteResponse {
  data: {
    execution_id: string;
    status: string;
    message?: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineClient({
  initialPipelines,
  workspaces,
}: PipelineClientProps) {
  const [pipelines] = useState<PipelineWithMeta[]>(initialPipelines);
  const [selectedPipeline, setSelectedPipeline] =
    useState<PipelineWithMeta | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const executionStore = useExecutionStore();
  const { connect } = useExecutionWS();

  // Open start dialog for a pipeline
  const handleStartClick = useCallback((pipeline: PipelineWithMeta) => {
    setSelectedPipeline(pipeline);
    setDialogOpen(true);
  }, []);

  // Close dialog
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setSelectedPipeline(null);
  }, []);

  // Execute pipeline
  const handleExecute = useCallback(
    async (pipelineId: string, workspaceId: string, inputData: string) => {
      const pipeline = pipelines.find((p) => p.id === pipelineId);
      if (!pipeline) {
        throw new Error('파이프라인을 찾을 수 없습니다.');
      }

      // Parse input data (try JSON first, fallback to plain text)
      let parsedInput: Record<string, unknown>;
      try {
        parsedInput = JSON.parse(inputData) as Record<string, unknown>;
      } catch {
        parsedInput = { query: inputData };
      }

      // Call BFF API
      const response = await fetch('/api/pipelines/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          workspace_id: workspaceId,
          input_params: parsedInput,
        }),
      });

      if (!response.ok) {
        const errorBody: unknown = await response.json();
        const errorMessage =
          (errorBody as { error?: { message?: string } })?.error?.message ??
          `실행 요청 실패 (${String(response.status)})`;
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as ExecuteResponse;
      const executionId = result.data.execution_id;

      // Initialize execution store with pipeline steps
      const nodes = (pipeline.graph_definition?.nodes ?? []).map((n) => ({
        id: n.id,
        label: n.label,
      }));
      executionStore.startExecution(executionId, pipeline.name, nodes);

      // Close dialog
      setDialogOpen(false);
      setSelectedPipeline(null);

      // Connect WebSocket for real-time updates with Supabase session JWT
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      connect(executionId, token);
    },
    [pipelines, executionStore, connect],
  );

  const isExecuting = executionStore.status === 'running';

  return (
    <div className="space-y-6">
      {/* Hero */}
      <PageHero
        badge="파이프라인 관리"
        title="파이프라인"
        subtitle="AI 워크플로우를 실행하고 모니터링합니다"
        variant="amber"
        stats={[{ label: '파이프라인', value: pipelines.length }]}
      />

      {/* Pipeline cards grid */}
      {pipelines.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="등록된 파이프라인이 없습니다"
          description="파이프라인을 생성하여 에이전트 워크플로우를 자동화하세요."
        />
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              isExecuting={
                isExecuting &&
                executionStore.pipelineName === pipeline.name
              }
              onStart={handleStartClick}
            />
          ))}
        </div>
      )}

      {/* Execution monitor panel */}
      <ExecutionPanel />

      {/* Start dialog */}
      <StartDialog
        open={dialogOpen}
        pipeline={selectedPipeline}
        workspaces={workspaces}
        onClose={handleDialogClose}
        onExecute={handleExecute}
      />
    </div>
  );
}
