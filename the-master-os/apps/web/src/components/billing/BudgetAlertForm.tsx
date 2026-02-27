"use client";

import { useState, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { Bell, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BudgetAlert {
  id: string;
  workspace_id: string;
  threshold_percent: number;
  alert_type: "email" | "slack" | "both";
  is_enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

interface BudgetAlertFormProps {
  workspaceId: string;
  initialAlert: BudgetAlert | null;
  onSaved: () => void;
}

type AlertType = "email" | "slack" | "both";

const ALERT_TYPE_OPTIONS: { value: AlertType; label: string }[] = [
  { value: "email", label: "이메일" },
  { value: "slack", label: "Slack" },
  { value: "both", label: "둘 다" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "아직 발송되지 않음";
  }
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BudgetAlertForm({
  workspaceId,
  initialAlert,
  onSaved,
}: BudgetAlertFormProps) {
  const [thresholdPercent, setThresholdPercent] = useState<string>(
    String(initialAlert?.threshold_percent ?? 80),
  );
  const [alertType, setAlertType] = useState<AlertType>(
    initialAlert?.alert_type ?? "email",
  );
  const [isEnabled, setIsEnabled] = useState<boolean>(
    initialAlert?.is_enabled ?? true,
  );
  const [lastTriggered] = useState<string | null>(
    initialAlert?.last_triggered_at ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const threshold = Number(thresholdPercent);
      if (isNaN(threshold) || threshold < 1 || threshold > 100) {
        throw new Error("임계값은 1~100 사이여야 합니다.");
      }

      const res = await fetch("/api/billing/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          threshold_percent: threshold,
          alert_type: alertType,
          is_enabled: isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error(`알림 설정 저장 실패: ${String(res.status)}`);
      }

      setDirty(false);
      onSaved();
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: "billing.budgetAlertForm.save" },
      });
    } finally {
      setSaving(false);
    }
  }, [workspaceId, thresholdPercent, alertType, isEnabled, onSaved]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-500" />
          예산 알림 설정
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {/* Threshold input */}
          <div>
            <Input
              label="알림 임계값 (%)"
              type="number"
              min={1}
              max={100}
              step={5}
              value={thresholdPercent}
              onChange={(e) => {
                setThresholdPercent(e.target.value);
                setDirty(true);
              }}
              placeholder="80"
            />
            <p className="mt-1 text-xs text-gray-400">
              월간 크레딧 한도의 해당 비율에 도달하면 알림을 발송합니다.
            </p>
          </div>

          {/* Alert type - radio buttons */}
          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700">
              알림 방식
            </span>
            <div className="flex gap-4">
              {ALERT_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <input
                    type="radio"
                    name="alert_type"
                    value={option.value}
                    checked={alertType === option.value}
                    onChange={() => {
                      setAlertType(option.value);
                      setDirty(true);
                    }}
                    className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-600">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3">
            <div>
              <span className="text-sm font-medium text-gray-700">
                알림 활성화
              </span>
              <p className="text-xs text-gray-400">
                비활성화하면 임계값 초과 시에도 알림이 발송되지 않습니다.
              </p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked: boolean) => {
                setIsEnabled(checked);
                setDirty(true);
              }}
            />
          </div>

          {/* Last triggered */}
          <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
            <span className="text-xs font-medium text-gray-500">
              마지막 알림 발송
            </span>
            <p className="mt-0.5 text-sm text-gray-700">
              {formatDateTime(lastTriggered)}
            </p>
          </div>

          {/* Save button */}
          <Button
            size="sm"
            variant={dirty ? "primary" : "secondary"}
            isLoading={saving}
            disabled={!dirty || saving}
            onClick={() => {
              void handleSave();
            }}
            className="w-full"
          >
            <Save className="h-4 w-4" />
            알림 설정 저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
