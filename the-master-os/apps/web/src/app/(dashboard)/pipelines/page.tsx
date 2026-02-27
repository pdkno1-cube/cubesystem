import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { PipelineClient } from './pipeline-client';
import type { Database } from '@/types/database';

type PipelineRow = Database['public']['Tables']['pipelines']['Row'];

interface GraphNode {
  id: string;
  type: string;
  label: string;
}

interface GraphDefinition {
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string }>;
  entry_point: string;
}

export type PipelineWithMeta = Omit<PipelineRow, 'graph_definition'> & {
  graph_definition: GraphDefinition;
};

interface SimpleWorkspace {
  id: string;
  name: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// Server Component
// ---------------------------------------------------------------------------

export default async function PipelinesPage() {
  let pipelines: PipelineWithMeta[] = [];
  let workspaces: SimpleWorkspace[] = [];

  try {
    const supabase = await createClient();

    const { data: pipelinesData } = await supabase
      .from('pipelines')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    const { data: workspacesData } = await supabase
      .from('workspaces')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name', { ascending: true });

    pipelines = (pipelinesData ?? []) as unknown as PipelineWithMeta[];
    workspaces = (workspacesData ?? []) as SimpleWorkspace[];
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'pipelines.page.load' } });
    pipelines = [];
    workspaces = [];
  }

  return (
    <PipelineClient
      initialPipelines={pipelines}
      workspaces={workspaces}
    />
  );
}
