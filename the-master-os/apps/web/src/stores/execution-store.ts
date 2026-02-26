import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExecutionStep {
  nodeId: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  resultPreview?: string;
}

interface NodeDefinition {
  id: string;
  label: string;
}

interface ExecutionState {
  currentExecutionId: string | null;
  pipelineName: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  steps: ExecutionStep[];
  totalCost: number;
  error: string | null;

  // Actions
  startExecution: (
    executionId: string,
    pipelineName: string,
    nodes: NodeDefinition[],
  ) => void;
  updateStep: (nodeId: string, update: Partial<ExecutionStep>) => void;
  completeExecution: (
    status: 'completed' | 'failed',
    totalCost?: number,
    error?: string,
  ) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: Pick<
  ExecutionState,
  'currentExecutionId' | 'pipelineName' | 'status' | 'steps' | 'totalCost' | 'error'
> = {
  currentExecutionId: null,
  pipelineName: null,
  status: 'idle',
  steps: [],
  totalCost: 0,
  error: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExecutionStore = create<ExecutionState>()((set) => ({
  ...initialState,

  startExecution: (executionId, pipelineName, nodes) => {
    set({
      currentExecutionId: executionId,
      pipelineName,
      status: 'running',
      error: null,
      totalCost: 0,
      steps: nodes.map((node) => ({
        nodeId: node.id,
        label: node.label,
        status: 'pending' as const,
      })),
    });
  },

  updateStep: (nodeId, update) => {
    set((state) => ({
      steps: state.steps.map((step) =>
        step.nodeId === nodeId ? { ...step, ...update } : step,
      ),
    }));
  },

  completeExecution: (status, totalCost, error) => {
    set((state) => ({
      status,
      totalCost: totalCost ?? state.totalCost,
      error: error ?? null,
      // Mark any still-running steps as failed when execution fails
      steps:
        status === 'failed'
          ? state.steps.map((step) =>
              step.status === 'running' || step.status === 'pending'
                ? { ...step, status: 'failed' as const }
                : step,
            )
          : state.steps,
    }));
  },

  reset: () => {
    set(initialState);
  },
}));
