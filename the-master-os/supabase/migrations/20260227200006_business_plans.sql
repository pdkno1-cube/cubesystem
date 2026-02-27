-- ============================================================================
-- Migration: business_plans table
-- N-04: 10분 사업계획서 자동 생성기
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.business_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  industry      TEXT NOT NULL DEFAULT '',
  target_market TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'generating', 'completed', 'exported')),
  company_name        TEXT NOT NULL DEFAULT '',
  company_description TEXT NOT NULL DEFAULT '',
  tam_value     BIGINT DEFAULT 0,
  sam_value     BIGINT DEFAULT 0,
  som_value     BIGINT DEFAULT 0,
  competitors   JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections      JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at  TIMESTAMPTZ,
  exported_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_business_plans_workspace ON public.business_plans(workspace_id);
CREATE INDEX idx_business_plans_status    ON public.business_plans(status);
CREATE INDEX idx_business_plans_created   ON public.business_plans(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_business_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_business_plans_updated_at
  BEFORE UPDATE ON public.business_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_business_plans_updated_at();

-- RLS
ALTER TABLE public.business_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workspace business plans"
  ON public.business_plans FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own workspace business plans"
  ON public.business_plans FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own workspace business plans"
  ON public.business_plans FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own workspace business plans"
  ON public.business_plans FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );
