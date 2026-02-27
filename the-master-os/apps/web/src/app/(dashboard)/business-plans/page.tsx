import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { PlansClient } from './plans-client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BusinessPlanSummary {
  id: string;
  workspace_id: string;
  title: string;
  industry: string;
  target_market: string;
  status: 'draft' | 'generating' | 'completed' | 'exported';
  company_name: string;
  tam_value: number;
  sam_value: number;
  som_value: number;
  created_at: string;
  updated_at: string;
}

// ── Server Component ───────────────────────────────────────────────────────

export default async function BusinessPlansPage() {
  let plans: BusinessPlanSummary[] = [];
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
        const { data: plansData } = await supabase
          .from('business_plans')
          .select(
            'id, workspace_id, title, industry, target_market, status, company_name, tam_value, sam_value, som_value, created_at, updated_at',
          )
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(50);

        plans = (plansData ?? []) as unknown as BusinessPlanSummary[];
      }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'business-plans.page.load' } });
  }

  return <PlansClient initialPlans={plans} workspaceId={workspaceId} />;
}
