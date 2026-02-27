-- =============================================================================
-- Migration: RLS Policies Completion
-- The Master OS -- 누락된 RLS 정책 보완 + 과도하게 열린 정책 강화
-- =============================================================================
-- Audit results:
--   1. subscription_plans:      RLS 미설정 (공개 읽기, 쓰기 차단)
--   2. workspace_subscriptions: RLS 미설정 (workspace 기반 격리 필요)
--   3. budget_alerts:           RLS 미설정 (workspace 기반 격리 필요)
--   4. credit_limits:           RLS 미설정 (workspace 기반 격리 필요)
--   5. audit_logs_archive:      RLS 미설정 (audit_logs와 동일 정책 필요)
--   6. persona_debates:         USING(true) -> workspace 기반으로 강화
--   7. debate_messages:         USING(true) -> 부모 테이블 workspace 기반으로 강화
--   8. agent_metrics:           USING(true) -> workspace 기반으로 강화
-- =============================================================================

-- =============================================================================
-- 1. subscription_plans -- 공개 읽기, 쓰기는 service_role만
-- =============================================================================
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 플랜 목록 조회 가능
CREATE POLICY subscription_plans_select_authenticated
    ON subscription_plans FOR SELECT
    TO authenticated
    USING (true);

-- INSERT/UPDATE/DELETE: service_role만 (클라이언트 차단)
-- Supabase에서 RLS 활성화 + 정책 없음 = 자동 차단

-- =============================================================================
-- 2. workspace_subscriptions -- workspace 기반 격리
-- =============================================================================
ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ws_sub_select ON workspace_subscriptions
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY ws_sub_insert ON workspace_subscriptions
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY ws_sub_update ON workspace_subscriptions
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- DELETE: owner만
CREATE POLICY ws_sub_delete ON workspace_subscriptions
    FOR DELETE
    USING (
        workspace_id IN (SELECT public.user_owner_workspace_ids())
    );

-- =============================================================================
-- 3. budget_alerts -- workspace 기반 격리
-- =============================================================================
ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ba_select ON budget_alerts
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY ba_insert ON budget_alerts
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY ba_update ON budget_alerts
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY ba_delete ON budget_alerts
    FOR DELETE
    USING (
        workspace_id IN (SELECT public.user_owner_workspace_ids())
    );

-- =============================================================================
-- 4. credit_limits -- workspace 기반 격리
-- =============================================================================
ALTER TABLE credit_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY cl_select ON credit_limits
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY cl_insert ON credit_limits
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY cl_update ON credit_limits
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- DELETE: owner만
CREATE POLICY cl_delete ON credit_limits
    FOR DELETE
    USING (
        workspace_id IN (SELECT public.user_owner_workspace_ids())
    );

-- =============================================================================
-- 5. audit_logs_archive -- audit_logs와 동일한 보안 수준
-- =============================================================================
ALTER TABLE audit_logs_archive ENABLE ROW LEVEL SECURITY;

-- 시스템 레벨 이벤트: global owner만
CREATE POLICY ala_system_access ON audit_logs_archive
    FOR SELECT
    USING (
        workspace_id IS NULL
        AND auth.uid() IN (
            SELECT id FROM users
            WHERE role = 'owner'
            AND deleted_at IS NULL
        )
    );

-- 워크스페이스 레벨 이벤트: admin 이상만
CREATE POLICY ala_workspace_access ON audit_logs_archive
    FOR SELECT
    USING (
        workspace_id IS NOT NULL
        AND workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- INSERT: archive 함수(SECURITY DEFINER)만 사용하므로 클라이언트 차단
-- UPDATE/DELETE: 불변 로그이므로 정책 없음 = 차단

-- =============================================================================
-- 6. persona_debates -- USING(true) 제거, workspace 기반으로 강화
-- =============================================================================
DROP POLICY IF EXISTS "persona_debates_select" ON public.persona_debates;
DROP POLICY IF EXISTS "persona_debates_insert" ON public.persona_debates;
DROP POLICY IF EXISTS "persona_debates_update" ON public.persona_debates;

CREATE POLICY persona_debates_ws_select ON public.persona_debates
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY persona_debates_ws_insert ON public.persona_debates
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY persona_debates_ws_update ON public.persona_debates
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

-- =============================================================================
-- 7. debate_messages -- USING(true) 제거, 부모 debate의 workspace_id 기반
-- =============================================================================
DROP POLICY IF EXISTS "debate_messages_select" ON public.debate_messages;
DROP POLICY IF EXISTS "debate_messages_insert" ON public.debate_messages;

CREATE POLICY debate_messages_ws_select ON public.debate_messages
    FOR SELECT
    USING (
        debate_id IN (
            SELECT id FROM public.persona_debates
            WHERE workspace_id IN (SELECT public.user_workspace_ids())
        )
    );

CREATE POLICY debate_messages_ws_insert ON public.debate_messages
    FOR INSERT
    WITH CHECK (
        debate_id IN (
            SELECT id FROM public.persona_debates
            WHERE workspace_id IN (SELECT public.user_workspace_ids())
        )
    );

-- =============================================================================
-- 8. agent_metrics -- USING(true) 제거, workspace 기반으로 강화
-- =============================================================================
DROP POLICY IF EXISTS "agent_metrics_select" ON public.agent_metrics;
DROP POLICY IF EXISTS "agent_metrics_insert" ON public.agent_metrics;

CREATE POLICY agent_metrics_ws_select ON public.agent_metrics
    FOR SELECT
    USING (
        workspace_id IN (SELECT public.user_workspace_ids())
    );

CREATE POLICY agent_metrics_ws_insert ON public.agent_metrics
    FOR INSERT
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );

CREATE POLICY agent_metrics_ws_update ON public.agent_metrics
    FOR UPDATE
    USING (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    )
    WITH CHECK (
        workspace_id IN (SELECT public.user_admin_workspace_ids())
    );
