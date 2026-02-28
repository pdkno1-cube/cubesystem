import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import type { ServiceStatus } from '@/components/settings/infra-service-config';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertStatus = 'degraded' | 'down' | 'recovered';

interface ServicePayload {
  id: string;
  name: string;
  status: string;
  connectionStatus: string;
  metrics: Array<{
    label: string;
    usagePercent: number;
    current: number | null;
    limit: number;
    unit: string;
  }>;
}

interface InfraStatusPayload {
  services: ServicePayload[];
  totalMonthlyCostUsd: number;
  lastUpdated: string;
}

interface HealthAlertRow {
  id: string;
  service_name: string;
  status: string;
  message: string | null;
  created_at: string;
}

interface AlertResult {
  service_name: string;
  status: AlertStatus;
  message: string;
  email_sent: boolean;
  skipped: boolean;
  skip_reason?: string;
}

interface CheckResponse {
  checked_at: string;
  total_services: number;
  alerts: AlertResult[];
  recovered: AlertResult[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map infra-status service status to alert status */
function mapToAlertStatus(serviceStatus: ServiceStatus): AlertStatus | null {
  if (serviceStatus === 'critical') {
    return 'down';
  }
  if (serviceStatus === 'warning') {
    return 'degraded';
  }
  return null;
}

/** Build a human-readable message from service metrics */
function buildAlertMessage(service: ServicePayload): string {
  const parts: string[] = [`${service.name} is ${service.status}`];

  for (const m of service.metrics) {
    if (m.current !== null && m.usagePercent > 0) {
      parts.push(`${m.label}: ${String(m.current)}/${String(m.limit)} ${m.unit} (${String(m.usagePercent)}%)`);
    }
  }

  return parts.join(' | ');
}

/** Send an alert email via Resend */
async function sendAlertEmail(
  resendKey: string,
  serviceName: string,
  status: AlertStatus,
  message: string,
): Promise<boolean> {
  const statusLabels: Record<AlertStatus, string> = {
    degraded: 'Degraded',
    down: 'DOWN',
    recovered: 'Recovered',
  };

  const statusColors: Record<AlertStatus, string> = {
    degraded: '#f59e0b',
    down: '#ef4444',
    recovered: '#22c55e',
  };

  const statusLabel = statusLabels[status];
  const statusColor = statusColors[status];

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'alerts@cubesystem.co.kr',
        to: ['cube@cubesystem.co.kr'],
        subject: `[Alert] ${serviceName} — ${statusLabel}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${statusColor}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0; font-size: 20px;">${serviceName} is ${statusLabel}</h2>
            </div>
            <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 12px; color: #374151; font-size: 14px;">${message}</p>
              <p style="margin: 0 0 16px; color: #6b7280; font-size: 13px;">Time: ${new Date().toISOString()}</p>
              <a href="https://the-master-os.vercel.app/settings"
                 style="display: inline-block; background: #3b82f6; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px;">
                View Dashboard
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 12px;">
              The Master OS - Automated Infrastructure Health Alert
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      Sentry.captureException(
        new Error(`Resend API error ${String(emailRes.status)}: ${errText}`),
        { tags: { context: 'infra-alerts.check.resend' } },
      );
      return false;
    }

    return true;
  } catch (err) {
    Sentry.captureException(err, { tags: { context: 'infra-alerts.check.send-email' } });
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /api/settings/infra-alerts/check
// ---------------------------------------------------------------------------

export async function POST(): Promise<NextResponse<CheckResponse | { error: string }>> {
  try {
    const supabase = await createClient();

    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch current infra status from internal API
    const baseUrl = process.env['NEXT_PUBLIC_APP_URL']
      ?? process.env['VERCEL_URL']
      ?? 'http://localhost:3000';
    const protocol = baseUrl.startsWith('http') ? '' : 'https://';

    let infraData: InfraStatusPayload | null = null;

    try {
      const infraRes = await fetch(`${protocol}${baseUrl}/api/settings/infra-status`, {
        headers: { cookie: '' },
        cache: 'no-store',
      });

      if (infraRes.ok) {
        infraData = (await infraRes.json()) as InfraStatusPayload;
      }
    } catch (fetchErr) {
      Sentry.captureException(fetchErr, { tags: { context: 'infra-alerts.check.fetch-status' } });
    }

    if (!infraData) {
      return NextResponse.json({
        checked_at: new Date().toISOString(),
        total_services: 0,
        alerts: [],
        recovered: [],
        summary: 'Could not fetch infrastructure status',
      });
    }

    // 3. Get Resend API key from env
    const resendKey = process.env['RESEND_API_KEY'] ?? null;

    // 4. Get recent alerts from the last hour to avoid duplicates
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentAlerts, error: recentErr } = await supabase
      .from('mcp_health_alerts')
      .select('id, service_name, status, message, created_at')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false });

    if (recentErr) {
      Sentry.captureException(recentErr, { tags: { context: 'infra-alerts.check.recent-query' } });
    }

    const typedRecentAlerts = (recentAlerts ?? []) as HealthAlertRow[];

    // Build a map: service_name -> most recent alert status
    const recentAlertMap = new Map<string, string>();
    for (const alert of typedRecentAlerts) {
      if (!recentAlertMap.has(alert.service_name)) {
        recentAlertMap.set(alert.service_name, alert.status);
      }
    }

    // 5. Get the last known "down" or "degraded" services (for recovery detection)
    //    Look back further (24h) for services that might have recovered
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: previousDownAlerts } = await supabase
      .from('mcp_health_alerts')
      .select('id, service_name, status, message, created_at')
      .in('status', ['degraded', 'down'])
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    const typedPreviousDown = (previousDownAlerts ?? []) as HealthAlertRow[];

    // Build set of services that were previously down/degraded
    const previouslyDownServices = new Set<string>();
    for (const alert of typedPreviousDown) {
      previouslyDownServices.add(alert.service_name);
    }

    // 6. Process each service
    const alertResults: AlertResult[] = [];
    const recoveredResults: AlertResult[] = [];

    for (const service of infraData.services) {
      const alertStatus = mapToAlertStatus(service.status as ServiceStatus);

      if (alertStatus !== null) {
        // Service is in warning or critical state
        const message = buildAlertMessage(service);
        const alreadyAlerted = recentAlertMap.get(service.name);

        if (alreadyAlerted === alertStatus) {
          // Already sent an alert for this service+status in the last hour
          alertResults.push({
            service_name: service.name,
            status: alertStatus,
            message,
            email_sent: false,
            skipped: true,
            skip_reason: 'Alert already sent within the last hour',
          });
          continue;
        }

        // Insert alert record
        const { error: insertErr } = await supabase
          .from('mcp_health_alerts')
          .insert({
            service_name: service.name,
            status: alertStatus,
            message,
          });

        if (insertErr) {
          Sentry.captureException(insertErr, {
            tags: { context: 'infra-alerts.check.insert-alert' },
            extra: { service: service.name, status: alertStatus },
          });
        }

        // Send email notification
        let emailSent = false;
        if (resendKey) {
          emailSent = await sendAlertEmail(resendKey, service.name, alertStatus, message);
        }

        alertResults.push({
          service_name: service.name,
          status: alertStatus,
          message,
          email_sent: emailSent,
          skipped: false,
        });
      } else if (
        previouslyDownServices.has(service.name) &&
        (service.status === 'stable' || service.status === 'good')
      ) {
        // Service recovered: was previously down/degraded, now stable/good
        const recoveryMessage = `${service.name} has recovered and is now ${service.status}`;

        // Check if we already sent a recovery alert in the last hour
        const alreadyRecovered = recentAlertMap.get(service.name);
        if (alreadyRecovered === 'recovered') {
          recoveredResults.push({
            service_name: service.name,
            status: 'recovered',
            message: recoveryMessage,
            email_sent: false,
            skipped: true,
            skip_reason: 'Recovery alert already sent within the last hour',
          });
          continue;
        }

        // Insert recovery record
        const { error: insertErr } = await supabase
          .from('mcp_health_alerts')
          .insert({
            service_name: service.name,
            status: 'recovered' as const,
            message: recoveryMessage,
          });

        if (insertErr) {
          Sentry.captureException(insertErr, {
            tags: { context: 'infra-alerts.check.insert-recovery' },
            extra: { service: service.name },
          });
        }

        // Send recovery email
        let emailSent = false;
        if (resendKey) {
          emailSent = await sendAlertEmail(resendKey, service.name, 'recovered', recoveryMessage);
        }

        recoveredResults.push({
          service_name: service.name,
          status: 'recovered',
          message: recoveryMessage,
          email_sent: emailSent,
          skipped: false,
        });
      }
    }

    // 7. Log breadcrumb
    Sentry.addBreadcrumb({
      category: 'infra-alerts-check',
      message: `Health check complete: ${String(alertResults.length)} alerts, ${String(recoveredResults.length)} recovered`,
      level: 'info',
      data: {
        alertCount: alertResults.length,
        recoveredCount: recoveredResults.length,
        services: alertResults.map((a) => a.service_name),
      },
    });

    const activeAlerts = alertResults.filter((a) => !a.skipped);
    const activeRecoveries = recoveredResults.filter((r) => !r.skipped);

    const summaryParts: string[] = [];
    if (activeAlerts.length > 0) {
      summaryParts.push(`${String(activeAlerts.length)} new alert(s)`);
    }
    if (activeRecoveries.length > 0) {
      summaryParts.push(`${String(activeRecoveries.length)} recovery(ies)`);
    }
    const skippedCount = alertResults.filter((a) => a.skipped).length + recoveredResults.filter((r) => r.skipped).length;
    if (skippedCount > 0) {
      summaryParts.push(`${String(skippedCount)} skipped (already notified)`);
    }
    if (summaryParts.length === 0) {
      summaryParts.push('All services healthy');
    }

    return NextResponse.json({
      checked_at: new Date().toISOString(),
      total_services: infraData.services.length,
      alerts: alertResults,
      recovered: recoveredResults,
      summary: summaryParts.join(', '),
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { context: 'infra-alerts.check.POST' } });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
