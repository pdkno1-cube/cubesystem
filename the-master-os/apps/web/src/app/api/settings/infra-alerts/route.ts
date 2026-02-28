import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import type { ServiceStatus } from '@/components/settings/infra-service-config';

export const dynamic = 'force-dynamic';

// ─── Types ──────────────────────────────────────────────────────
interface AlertInfo {
  serviceId: string;
  serviceName: string;
  status: ServiceStatus;
  monthlyCostUsd: number;
  topMetricLabel: string;
  topMetricUsagePercent: number;
}

interface InfraAlertsResponse {
  alerts: AlertInfo[];
  emailSent: boolean;
  reason?: string;
}

interface InfraServicePayload {
  id: string;
  name: string;
  status: string;
  monthlyCostUsd: number;
  metrics: Array<{
    label: string;
    usagePercent: number;
  }>;
}

interface InfraStatusPayload {
  services: InfraServicePayload[];
  totalMonthlyCostUsd: number;
  lastUpdated: string;
}

interface NotificationRow {
  id: string;
  triggered_at: string;
}

interface VaultRow {
  encrypted_value: string;
}

// ─── POST /api/settings/infra-alerts ─────────────────────────────
export async function POST(): Promise<NextResponse<InfraAlertsResponse | { error: string }>> {
  try {
    const supabase = await createClient();

    // 1. Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch current infra status from internal API
    //    We call the infra-status route handler directly via internal fetch
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? process.env.VERCEL_URL
      ?? 'http://localhost:3000';
    const protocol = baseUrl.startsWith('http') ? '' : 'https://';

    let infraData: InfraStatusPayload | null = null;

    try {
      const infraRes = await fetch(`${protocol}${baseUrl}/api/settings/infra-status`, {
        headers: {
          cookie: '', // Server-side call; auth is handled by supabase client
        },
        cache: 'no-store',
      });

      if (infraRes.ok) {
        infraData = (await infraRes.json()) as InfraStatusPayload;
      }
    } catch (fetchErr) {
      Sentry.captureException(fetchErr, { tags: { context: 'infra-alerts.fetch-status' } });
    }

    // 3. If we couldn't get infra data, query the DB directly for latest snapshots
    if (!infraData) {
      // Fallback: query infra_cost_snapshots for latest month
      const now = new Date();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const currentYear = now.getFullYear();

      const { data: latestSnapshots } = await supabase
        .from('infra_cost_snapshots')
        .select('service_id, service_name, monthly_cost_usd, status')
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .order('monthly_cost_usd', { ascending: false });

      if (latestSnapshots && latestSnapshots.length > 0) {
        const services: InfraServicePayload[] = (
          latestSnapshots as Array<{
            service_id: string;
            service_name: string;
            monthly_cost_usd: number;
            status: string;
          }>
        ).map((snap) => ({
          id: snap.service_id,
          name: snap.service_name,
          status: snap.status,
          monthlyCostUsd: Number(snap.monthly_cost_usd),
          metrics: [],
        }));

        infraData = {
          services,
          totalMonthlyCostUsd: services.reduce((sum, s) => sum + s.monthlyCostUsd, 0),
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    // 4. Filter services with status 'warning' or 'critical'
    const alertableStatuses: ReadonlySet<string> = new Set(['warning', 'critical']);

    const alerts: AlertInfo[] = [];

    if (infraData) {
      for (const svc of infraData.services) {
        if (alertableStatuses.has(svc.status)) {
          const topMetric = svc.metrics.length > 0
            ? svc.metrics.reduce(
                (max, m) => (m.usagePercent > max.usagePercent ? m : max),
                svc.metrics[0]!,
              )
            : { label: svc.status, usagePercent: 0 };

          alerts.push({
            serviceId: svc.id,
            serviceName: svc.name,
            status: svc.status as ServiceStatus,
            monthlyCostUsd: svc.monthlyCostUsd,
            topMetricLabel: topMetric.label,
            topMetricUsagePercent: topMetric.usagePercent,
          });
        }
      }
    }

    // If no alertable services, return early
    if (alerts.length === 0) {
      return NextResponse.json({
        alerts: [],
        emailSent: false,
        reason: 'No services in warning or critical state',
      });
    }

    // 5. Check if alert was already sent today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: existingNotifs } = await supabase
      .from('budget_alert_notifications')
      .select('id, triggered_at')
      .eq('alert_type', 'email')
      .gte('triggered_at', todayStart.toISOString())
      .limit(1);

    const alreadySentToday = (existingNotifs as NotificationRow[] | null)?.length
      ? (existingNotifs as NotificationRow[]).length > 0
      : false;

    if (alreadySentToday) {
      return NextResponse.json({
        alerts,
        emailSent: false,
        reason: 'Alert email already sent today',
      });
    }

    // 6. Get Resend API key from vault
    const { data: vaultSecrets } = await supabase
      .from('secret_vault')
      .select('encrypted_value')
      .eq('service_name', 'resend')
      .is('deleted_at', null)
      .limit(1);

    const vaultRows = vaultSecrets as VaultRow[] | null;
    const resendApiKey = vaultRows?.[0]?.encrypted_value;

    let emailSent = false;

    if (resendApiKey) {
      // 7. Send alert email via Resend
      try {
        const alertSummary = alerts
          .map((a) => `- ${a.serviceName}: ${a.status} (${a.topMetricLabel} ${String(a.topMetricUsagePercent)}%)`)
          .join('\n');

        const emailBody = {
          from: 'The Master OS <infra-alerts@cubesystem.co.kr>',
          to: [user.email ?? ''],
          subject: `[The Master OS] 인프라 예산 알림 - ${String(alerts.length)}개 서비스 주의`,
          html: `
            <h2>인프라 예산 알림</h2>
            <p>${String(alerts.length)}개 서비스가 주의 상태입니다.</p>
            <pre>${alertSummary}</pre>
            <p>자세한 내용은 <a href="${protocol}${baseUrl}/infra-cost">인프라 비용 대시보드</a>에서 확인하세요.</p>
            <hr />
            <p style="color: #999; font-size: 12px;">The Master OS - Automated Infrastructure Alert</p>
          `,
        };

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailBody),
        });

        if (emailRes.ok) {
          emailSent = true;
        } else {
          const errText = await emailRes.text();
          Sentry.captureException(
            new Error(`Resend API error ${String(emailRes.status)}: ${errText}`),
            { tags: { context: 'infra-alerts.resend' } },
          );
        }
      } catch (emailErr) {
        Sentry.captureException(emailErr, { tags: { context: 'infra-alerts.send-email' } });
      }
    }

    // 8. Record notification in budget_alert_notifications
    const { error: insertError } = await supabase
      .from('budget_alert_notifications')
      .insert({
        alert_type: 'email',
        triggered_at: new Date().toISOString(),
        notified: emailSent,
        usage_percent: alerts[0]?.topMetricUsagePercent ?? 0,
        threshold_percent: 80,
      });

    if (insertError) {
      Sentry.captureException(insertError, {
        tags: { context: 'infra-alerts.record-notification' },
        extra: { alertCount: alerts.length, emailSent },
      });
    }

    Sentry.addBreadcrumb({
      category: 'infra-alerts',
      message: `Infra alerts dispatched: ${String(alerts.length)} services, email=${String(emailSent)}`,
      level: 'info',
      data: {
        alertCount: alerts.length,
        emailSent,
        services: alerts.map((a) => a.serviceId),
      },
    });

    return NextResponse.json({
      alerts,
      emailSent,
      reason: emailSent
        ? 'Alert email sent successfully'
        : (resendApiKey ? 'Email send failed' : 'Resend API key not configured in vault'),
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { context: 'infra-alerts.POST' } });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
