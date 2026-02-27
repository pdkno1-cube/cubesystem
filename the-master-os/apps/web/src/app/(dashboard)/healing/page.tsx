import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { HealingClient } from './healing-client';
import type { HealingIncident, HealingStats } from './healing-client';

// ---------------------------------------------------------------------------
// Server Component — fetch initial incidents + stats
// ---------------------------------------------------------------------------

const EMPTY_STATS: HealingStats = {
  total_incidents: 0,
  auto_resolved: 0,
  auto_resolve_rate: 0,
  avg_recovery_seconds: 0,
  active_incidents: 0,
  by_severity: {},
  by_type: {},
};

export default async function HealingPage() {
  let incidents: HealingIncident[] = [];
  let stats: HealingStats = EMPTY_STATS;
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
        const { data: incidentsData } = await supabase
          .from('healing_incidents')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('detected_at', { ascending: false })
          .limit(50);

        incidents = (incidentsData ?? []) as HealingIncident[];

        // Compute stats server-side
        const rows = incidents;
        let autoResolved = 0;
        let activeCount = 0;
        let totalRecoverySec = 0;
        let resolvedCount = 0;
        const bySeverity: Record<string, number> = {};
        const byType: Record<string, number> = {};

        for (const row of rows) {
          const sev = row.severity ?? 'medium';
          bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;

          const incType = row.incident_type ?? 'unknown';
          byType[incType] = (byType[incType] ?? 0) + 1;

          if (row.status === 'resolved') {
            autoResolved += 1;
            if (row.detected_at && row.resolved_at) {
              const delta =
                (new Date(row.resolved_at).getTime() - new Date(row.detected_at).getTime()) / 1000;
              if (delta >= 0) {
                totalRecoverySec += delta;
                resolvedCount += 1;
              }
            }
          } else if (['detected', 'diagnosing', 'healing'].includes(row.status)) {
            activeCount += 1;
          }
        }

        stats = {
          total_incidents: rows.length,
          auto_resolved: autoResolved,
          auto_resolve_rate:
            rows.length > 0 ? Math.round((autoResolved / rows.length) * 10000) / 10000 : 0,
          avg_recovery_seconds:
            resolvedCount > 0
              ? Math.round((totalRecoverySec / resolvedCount) * 10) / 10
              : 0,
          active_incidents: activeCount,
          by_severity: bySeverity,
          by_type: byType,
        };
      }
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'healing.page.load' } });
  }

  return (
    <HealingClient
      initialIncidents={incidents}
      initialStats={stats}
      workspaceId={workspaceId}
    />
  );
}
