import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ─── Types ──────────────────────────────────────────────────────
interface ServiceCostEntry {
  service_id: string;
  cost: number;
}

interface MonthlyHistory {
  month: string;
  year: number;
  totalCostUsd: number;
  services: ServiceCostEntry[];
}

interface InfraHistoryResponse {
  history: MonthlyHistory[];
}

interface SnapshotRow {
  month: string;
  year: number;
  service_id: string;
  monthly_cost_usd: number;
}

// ─── GET /api/settings/infra-history ─────────────────────────────
export async function GET(
  request: NextRequest,
): Promise<NextResponse<InfraHistoryResponse | { error: string }>> {
  try {
    const supabase = await createClient();

    // 1. Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse query params
    const searchParams = request.nextUrl.searchParams;
    let workspaceId = searchParams.get('workspace_id');
    const monthsParam = searchParams.get('months');
    const months = monthsParam ? parseInt(monthsParam, 10) : 9;

    // 3. If no workspace_id, find the first workspace owned by user
    if (!workspaceId) {
      const { data: ownedWorkspaces, error: wsError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1);

      if (wsError) {
        Sentry.captureException(wsError, { tags: { context: 'infra-history.workspace-lookup' } });
        return NextResponse.json({ error: 'Failed to find workspace' }, { status: 500 });
      }

      const firstWorkspace = ownedWorkspaces?.[0];
      if (!firstWorkspace) {
        return NextResponse.json({ history: [] });
      }
      workspaceId = firstWorkspace.id as string;
    }

    // 4. Calculate date range for the query
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 3), 1);
    const startYear = startDate.getFullYear();
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');

    // 5. Query infra_cost_snapshots grouped by year+month
    const { data: snapshots, error: snapError } = await supabase
      .from('infra_cost_snapshots')
      .select('month, year, service_id, monthly_cost_usd')
      .eq('workspace_id', workspaceId)
      .or(
        `and(year.gt.${String(startYear)},year.lte.${String(now.getFullYear())}),and(year.eq.${String(startYear)},month.gte.${startMonth})`,
      )
      .order('year', { ascending: true })
      .order('month', { ascending: true });

    if (snapError) {
      Sentry.captureException(snapError, { tags: { context: 'infra-history.query' } });
      return NextResponse.json({ error: 'Failed to fetch cost history' }, { status: 500 });
    }

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({ history: [] });
    }

    // 6. Group by year+month
    const groupKey = (row: SnapshotRow): string => `${String(row.year)}-${row.month}`;
    const grouped = new Map<string, { month: string; year: number; services: ServiceCostEntry[] }>();

    for (const row of snapshots as SnapshotRow[]) {
      const key = groupKey(row);
      let entry = grouped.get(key);
      if (!entry) {
        entry = { month: row.month, year: row.year, services: [] };
        grouped.set(key, entry);
      }
      entry.services.push({
        service_id: row.service_id,
        cost: Number(row.monthly_cost_usd),
      });
    }

    // 7. Build sorted history array
    const history: MonthlyHistory[] = Array.from(grouped.values())
      .sort((a, b) => {
        const yearDiff = a.year - b.year;
        if (yearDiff !== 0) {
          return yearDiff;
        }
        return a.month.localeCompare(b.month);
      })
      .slice(0, months)
      .map((entry) => ({
        month: entry.month,
        year: entry.year,
        totalCostUsd: Math.round(entry.services.reduce((sum, s) => sum + s.cost, 0) * 100) / 100,
        services: entry.services,
      }));

    return NextResponse.json({ history });
  } catch (err) {
    Sentry.captureException(err, { tags: { context: 'infra-history.GET' } });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
