import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { DocumentsClient } from './documents-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IssueItem {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  field?: string | null;
}

export interface DocumentReview {
  id: string;
  workspace_id: string;
  pipeline_execution_id: string | null;
  document_name: string;
  document_type: string;
  file_url: string | null;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'archived';
  issues: IssueItem[];
  reviewer_notes: string | null;
  gdrive_file_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Server Component
// ---------------------------------------------------------------------------

export default async function DocumentsPage() {
  let reviews: DocumentReview[] = [];
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
        const { data: reviewsData } = await supabase
          .from('document_reviews')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(100);

        reviews = (reviewsData ?? []) as DocumentReview[];
      }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'documents.page.load' } });
  }

  return (
    <DocumentsClient
      initialReviews={reviews}
      workspaceId={workspaceId}
    />
  );
}
