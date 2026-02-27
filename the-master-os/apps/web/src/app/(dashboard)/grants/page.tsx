import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { GrantsClient } from './grants-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenderSubmission {
  id: string;
  workspace_id: string;
  pipeline_execution_id: string | null;
  tender_id: string;
  tender_title: string;
  tender_url: string | null;
  organization: string | null;
  status: string;
  bid_amount: number | null;
  deadline: string | null;
  documents: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Server Component — fetch initial tender data
// ---------------------------------------------------------------------------

export default async function GrantsPage() {
  let tenders: TenderSubmission[] = [];
  let workspaceId = '';

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: workspacesData } = await supabase
        .from('workspaces')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      if (workspacesData && workspacesData.length > 0) {
        workspaceId = workspacesData[0]?.id ?? '';
      }

      if (workspaceId) {
        const { data: tendersData } = await supabase
          .from('tender_submissions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(100);

        tenders = (tendersData ?? []) as unknown as TenderSubmission[];
      }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'grants.page.load' } });
  }

  return (
    <GrantsClient
      initialTenders={tenders}
      workspaceId={workspaceId}
    />
  );
}
