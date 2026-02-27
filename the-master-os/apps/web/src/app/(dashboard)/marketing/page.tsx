import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { MarketingClient } from './marketing-client';
import type { ScheduleItem } from '@/stores/marketingStore';

// ---------------------------------------------------------------------------
// Server Component — fetch initial schedules + workspace
// ---------------------------------------------------------------------------

export default async function MarketingPage() {
  let schedules: ScheduleItem[] = [];
  let workspaceId = '';

  try {
    const supabase = await createClient();

    // 1. Get current user's primary workspace
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

      // 2. Fetch this month's schedules
      if (workspaceId) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const { data: schedulesData } = await supabase
          .from('content_schedules')
          .select('*')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .gte('scheduled_at', monthStart)
          .lte('scheduled_at', monthEnd)
          .order('scheduled_at', { ascending: true })
          .limit(200);

        schedules = (schedulesData ?? []) as ScheduleItem[];
      }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'marketing.page.load' } });
    // Supabase not connected or no session — render with empty state
  }

  return (
    <MarketingClient
      initialSchedules={schedules}
      workspaceId={workspaceId}
    />
  );
}
