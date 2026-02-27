-- ============================================================================
-- N-01: 다중 페르소나 토론 뷰어 + N-02: 에이전트 스코어카드
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. persona_debates — 토론 세션
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.persona_debates (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    pipeline_execution_id UUID REFERENCES public.pipeline_executions(id) ON DELETE SET NULL,
    topic       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'concluded')),
    summary     TEXT,
    conclusion  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persona_debates_workspace
    ON public.persona_debates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_persona_debates_status
    ON public.persona_debates(status);

-- --------------------------------------------------------------------------
-- 2. debate_messages — 토론 메시지
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.debate_messages (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    debate_id        UUID NOT NULL REFERENCES public.persona_debates(id) ON DELETE CASCADE,
    agent_id         UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    agent_role       TEXT NOT NULL CHECK (agent_role IN ('optimist', 'pessimist', 'realist', 'critic')),
    message_content  TEXT NOT NULL,
    reasoning        TEXT,
    confidence_score FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    sequence_order   INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debate_messages_debate
    ON public.debate_messages(debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_messages_agent
    ON public.debate_messages(agent_id);

-- --------------------------------------------------------------------------
-- 3. agent_metrics — 에이전트 스코어카드
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_metrics (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id     UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    metric_type  TEXT NOT NULL CHECK (metric_type IN ('success_rate', 'avg_response_time', 'cost_efficiency', 'quality_score')),
    metric_value FLOAT NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    sample_count INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent
    ON public.agent_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_workspace
    ON public.agent_metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_type_period
    ON public.agent_metrics(agent_id, metric_type, period_start);

-- --------------------------------------------------------------------------
-- 4. RLS Policies
-- --------------------------------------------------------------------------
ALTER TABLE public.persona_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_metrics   ENABLE ROW LEVEL SECURITY;

-- persona_debates: authenticated users can read/write
CREATE POLICY "persona_debates_select" ON public.persona_debates
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "persona_debates_insert" ON public.persona_debates
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "persona_debates_update" ON public.persona_debates
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- debate_messages: authenticated users can read/write
CREATE POLICY "debate_messages_select" ON public.debate_messages
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "debate_messages_insert" ON public.debate_messages
    FOR INSERT TO authenticated WITH CHECK (true);

-- agent_metrics: authenticated users can read/write
CREATE POLICY "agent_metrics_select" ON public.agent_metrics
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "agent_metrics_insert" ON public.agent_metrics
    FOR INSERT TO authenticated WITH CHECK (true);
