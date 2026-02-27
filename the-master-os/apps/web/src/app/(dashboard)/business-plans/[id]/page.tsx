import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { PlanViewer } from './plan-viewer';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BusinessPlanDetail {
  id: string;
  workspace_id: string;
  title: string;
  industry: string;
  target_market: string;
  status: 'draft' | 'generating' | 'completed' | 'exported';
  company_name: string;
  company_description: string;
  tam_value: number;
  sam_value: number;
  som_value: number;
  competitors: Array<{ name: string; description: string }>;
  sections: Record<string, unknown>;
  generated_at: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Server Component ───────────────────────────────────────────────────────

interface PageProps {
  params: { id: string };
}

export default async function BusinessPlanDetailPage({ params }: PageProps) {
  let plan: BusinessPlanDetail | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from('business_plans')
        .select('*')
        .eq('id', params.id)
        .is('deleted_at', null)
        .single();

      if (data) {
        plan = data as unknown as BusinessPlanDetail;
      }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'business-plans.[id].page.load' } });
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-lg font-semibold text-gray-700">
          사업계획서를 찾을 수 없습니다
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          삭제되었거나 존재하지 않는 사업계획서입니다
        </p>
      </div>
    );
  }

  return <PlanViewer plan={plan} />;
}
