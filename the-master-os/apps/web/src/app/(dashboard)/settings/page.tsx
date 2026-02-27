"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { User, Shield, Info, Server, ExternalLink, ShieldCheck, ShieldOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { InfraSection } from "@/components/settings/InfraSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import type { MfaEnrollResult } from "@/types/auth";

// -- 프로필 섹션 --
function ProfileSection() {
  const { user, isLoading } = useAuth();

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  const roleLabel =
    user?.role === "owner"
      ? "총괄 회장 (Owner)"
      : user?.role === "admin"
        ? "관리자 (Admin)"
        : user?.role === "member"
          ? "멤버 (Member)"
          : "뷰어 (Viewer)";

  const lastLogin = user?.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>프로필</CardTitle>
          <CardDescription>기본 계정 정보를 확인합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-gray-200" />
              <div className="space-y-2">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-200" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>프로필</CardTitle>
        <CardDescription>기본 계정 정보를 확인합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 아바타 */}
        <div className="flex items-center gap-4">
          <Avatar size="xl">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {user?.displayName ?? "—"}
            </p>
            <p className="text-sm text-gray-500">{roleLabel}</p>
          </div>
        </div>

        {/* 정보 필드 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-gray-500">이름</label>
            <p className="mt-1 text-gray-900">{user?.displayName ?? "—"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">이메일</label>
            <p className="mt-1 text-gray-900">{user?.email ?? "—"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">역할</label>
            <p className="mt-1 text-gray-900">{user?.role ?? "—"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">마지막 로그인</label>
            <p className="mt-1 text-gray-900">{lastLogin}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -- MFA 상태 타입 --
type MfaFlowStep = "idle" | "enrolling" | "verifying" | "unenrolling";

interface MfaFactorInfo {
  id: string;
  status: "verified" | "unverified";
  friendlyName: string | null;
}

// -- MFA 관리 섹션 --
function MFASection() {
  const [mfaFactor, setMfaFactor] = useState<MfaFactorInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [flowStep, setFlowStep] = useState<MfaFlowStep>("idle");
  const [enrollData, setEnrollData] = useState<MfaEnrollResult | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [unenrollCode, setUnenrollCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const isEnrolled = mfaFactor !== null && mfaFactor.status === "verified";

  const checkMfaStatus = useCallback(async () => {
    setChecking(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.mfa.listFactors();
      const totpFactors = data?.totp ?? [];
      const verifiedFactor = totpFactors.find((f) => f.status === "verified");
      if (verifiedFactor) {
        setMfaFactor({
          id: verifiedFactor.id,
          status: "verified",
          friendlyName: verifiedFactor.friendly_name ?? null,
        });
      } else {
        setMfaFactor(null);
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "settings.mfa.check" } });
      setMfaFactor(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkMfaStatus();
  }, [checkMfaStatus]);

  // -- Enroll: Step 1 -- Request QR code
  const handleStartEnroll = useCallback(async () => {
    setError(null);
    setSuccessMessage(null);
    setFlowStep("enrolling");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      const json: unknown = await res.json();
      const result = json as {
        data?: MfaEnrollResult;
        error?: { code: string; message: string };
      };

      if (!res.ok || result.error) {
        setError(result.error?.message ?? "MFA 등록 요청에 실패했습니다.");
        setFlowStep("idle");
        return;
      }

      if (result.data) {
        setEnrollData(result.data);
        setFlowStep("verifying");
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "settings.mfa.enroll" } });
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
      setFlowStep("idle");
    } finally {
      setSubmitting(false);
    }
  }, []);

  // -- Enroll: Step 2 -- Verify the TOTP code to confirm enrollment
  const handleVerifyEnrollment = useCallback(async () => {
    if (totpCode.length !== 6 || !/^\d{6}$/.test(totpCode)) {
      setError("6자리 숫자 코드를 입력해주세요.");
      return;
    }

    if (!enrollData) {
      setError("등록 데이터가 없습니다. 다시 시도해주세요.");
      setFlowStep("idle");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      // Step 1: Create a challenge for the enrolled factor
      const challengeRes = await fetch("/api/auth/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: enrollData.factorId }),
      });
      const challengeJson: unknown = await challengeRes.json();
      const challengeResult = challengeJson as {
        data?: { challengeId: string; factorId: string };
        error?: { code: string; message: string };
      };

      if (!challengeRes.ok || challengeResult.error) {
        setError(challengeResult.error?.message ?? "MFA 챌린지 생성에 실패했습니다.");
        setSubmitting(false);
        return;
      }

      const challengeId = challengeResult.data?.challengeId;
      if (!challengeId) {
        setError("챌린지 ID를 받지 못했습니다.");
        setSubmitting(false);
        return;
      }

      // Step 2: Verify the TOTP code against the challenge
      const verifyRes = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId: enrollData.factorId,
          challengeId,
          code: totpCode,
        }),
      });
      const verifyJson: unknown = await verifyRes.json();
      const verifyResult = verifyJson as {
        data?: { success: boolean };
        error?: { code: string; message: string };
      };

      if (!verifyRes.ok || verifyResult.error) {
        setError(verifyResult.error?.message ?? "코드 검증에 실패했습니다. 다시 시도해주세요.");
        setTotpCode("");
        codeInputRef.current?.focus();
        setSubmitting(false);
        return;
      }

      // Success
      setSuccessMessage("MFA가 성공적으로 활성화되었습니다.");
      setFlowStep("idle");
      setEnrollData(null);
      setTotpCode("");
      await checkMfaStatus();
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "settings.mfa.verify" } });
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [totpCode, enrollData, checkMfaStatus]);

  // -- Unenroll: Verify code then remove factor
  const handleStartUnenroll = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
    setUnenrollCode("");
    setFlowStep("unenrolling");
  }, []);

  const handleConfirmUnenroll = useCallback(async () => {
    if (unenrollCode.length !== 6 || !/^\d{6}$/.test(unenrollCode)) {
      setError("6자리 숫자 코드를 입력해주세요.");
      return;
    }

    if (!mfaFactor) {
      setError("MFA 팩터 정보가 없습니다.");
      setFlowStep("idle");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      // Step 1: Create a challenge
      const challengeRes = await fetch("/api/auth/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: mfaFactor.id }),
      });
      const challengeJson: unknown = await challengeRes.json();
      const challengeResult = challengeJson as {
        data?: { challengeId: string; factorId: string };
        error?: { code: string; message: string };
      };

      if (!challengeRes.ok || challengeResult.error) {
        setError(challengeResult.error?.message ?? "MFA 챌린지 생성에 실패했습니다.");
        setSubmitting(false);
        return;
      }

      const challengeId = challengeResult.data?.challengeId;
      if (!challengeId) {
        setError("챌린지 ID를 받지 못했습니다.");
        setSubmitting(false);
        return;
      }

      // Step 2: Verify the code
      const verifyRes = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId: mfaFactor.id,
          challengeId,
          code: unenrollCode,
        }),
      });
      const verifyJson: unknown = await verifyRes.json();
      const verifyResult = verifyJson as {
        data?: { success: boolean };
        error?: { code: string; message: string };
      };

      if (!verifyRes.ok || verifyResult.error) {
        setError(verifyResult.error?.message ?? "코드 검증에 실패했습니다.");
        setUnenrollCode("");
        setSubmitting(false);
        return;
      }

      // Step 3: Unenroll the factor
      const unenrollRes = await fetch("/api/auth/mfa/unenroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: mfaFactor.id }),
      });
      const unenrollJson: unknown = await unenrollRes.json();
      const unenrollResult = unenrollJson as {
        data?: { success: boolean };
        error?: { code: string; message: string };
      };

      if (!unenrollRes.ok || unenrollResult.error) {
        setError(unenrollResult.error?.message ?? "MFA 비활성화에 실패했습니다.");
        setSubmitting(false);
        return;
      }

      // Success
      setSuccessMessage("MFA가 비활성화되었습니다.");
      setFlowStep("idle");
      setUnenrollCode("");
      await checkMfaStatus();
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "settings.mfa.unenroll" } });
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [unenrollCode, mfaFactor, checkMfaStatus]);

  const handleCancelFlow = useCallback(() => {
    setFlowStep("idle");
    setEnrollData(null);
    setTotpCode("");
    setUnenrollCode("");
    setError(null);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>다단계 인증 (MFA)</CardTitle>
        <CardDescription>TOTP 기반 2단계 인증을 관리합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 현재 상태 표시 */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            {isEnrolled ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldOff className="h-5 w-5 text-gray-400" />
            )}
            <div>
              <p className="font-medium text-gray-900">TOTP 인증기</p>
              <p className="text-sm text-gray-500">
                Google Authenticator, Authy 등 TOTP 앱을 사용합니다
              </p>
            </div>
          </div>
          {checking ? (
            <div className="h-6 w-11 animate-pulse rounded-full bg-gray-200" />
          ) : (
            <div
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isEnrolled
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {isEnrolled ? "활성" : "미등록"}
            </div>
          )}
        </div>

        {/* 성공 메시지 */}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            <p className="text-sm text-green-700">{successMessage}</p>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
            <XCircle className="h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 미등록 안내 (idle 상태일 때만) */}
        {!isEnrolled && !checking && flowStep === "idle" && (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4">
            <p className="text-sm text-amber-700">
              MFA가 등록되지 않았습니다. 보안을 위해 TOTP 인증을 활성화하세요.
            </p>
          </div>
        )}

        {/* Enroll Flow: QR 코드 표시 + 코드 검증 */}
        {flowStep === "verifying" && enrollData && (
          <div className="space-y-4 rounded-lg border border-brand-200 bg-brand-50/30 p-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                1단계: QR 코드를 인증 앱으로 스캔하세요
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                Google Authenticator, Authy, 1Password 등의 TOTP 앱에서 QR 코드를 스캔해주세요.
              </p>
            </div>

            <div className="flex justify-center">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                {/* QR code is a data:image/svg+xml URI from Supabase */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollData.qrCode}
                  alt="MFA QR Code"
                  width={200}
                  height={200}
                  className="h-[200px] w-[200px]"
                />
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-600">
                QR 코드를 스캔할 수 없는 경우, 아래 URI를 수동으로 입력하세요:
              </p>
              <p className="mt-1 break-all font-mono text-xs text-gray-500">
                {enrollData.totpUri}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                2단계: 인증 앱에 표시된 6자리 코드를 입력하세요
              </h4>
              <div className="mt-2">
                <Input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => {
                    setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  className="text-center text-lg tracking-widest"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleVerifyEnrollment}
                isLoading={submitting}
                disabled={totpCode.length !== 6 || submitting}
              >
                활성화 확인
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelFlow}
                disabled={submitting}
              >
                취소
              </Button>
            </div>
          </div>
        )}

        {/* Unenroll Flow: 코드 검증 후 해제 */}
        {flowStep === "unenrolling" && (
          <div className="space-y-4 rounded-lg border border-red-200 bg-red-50/30 p-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                MFA 비활성화
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                비활성화하려면 현재 인증 앱에 표시된 6자리 코드를 입력하세요.
              </p>
            </div>

            <div>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={unenrollCode}
                onChange={(e) => {
                  setUnenrollCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                }}
                className="text-center text-lg tracking-widest"
                disabled={submitting}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmUnenroll}
                isLoading={submitting}
                disabled={unenrollCode.length !== 6 || submitting}
              >
                MFA 비활성화
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelFlow}
                disabled={submitting}
              >
                취소
              </Button>
            </div>
          </div>
        )}

        {/* 활성화/비활성화 버튼 (idle 상태에서만) */}
        {flowStep === "idle" && !checking && (
          <div className="border-t border-gray-200 pt-4">
            {isEnrolled ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStartUnenroll}
              >
                <ShieldOff className="h-4 w-4" />
                MFA 비활성화
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartEnroll}
                isLoading={submitting}
              >
                <ShieldCheck className="h-4 w-4" />
                MFA 활성화
              </Button>
            )}
          </div>
        )}

        {/* enrolling 로딩 상태 */}
        {flowStep === "enrolling" && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            <p className="text-sm text-gray-500">QR 코드 생성 중...</p>
          </div>
        )}

        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-400">
            PRD 요구사항: MFA TOTP 필수 (F-01). 프로덕션 배포 전 반드시 활성화해야 합니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

type ConnectionStatus = "연결됨" | "미연결" | "확인 중...";

function statusDotClass(status: ConnectionStatus): string {
  switch (status) {
    case "연결됨":
      return "bg-green-500";
    case "미연결":
      return "bg-red-400";
    case "확인 중...":
      return "bg-yellow-400 animate-pulse";
  }
}

// -- 시스템 정보 섹션 --
function SystemInfoSection() {
  const [supabaseStatus, setSupabaseStatus] = useState<ConnectionStatus>("확인 중...");
  const [fastapiStatus, setFastapiStatus] = useState<ConnectionStatus>("확인 중...");

  const checkSupabase = useCallback(async () => {
    setSupabaseStatus("확인 중...");
    try {
      const supabase = createClient();
      const { error } = await supabase.from("workspaces").select("id", { count: "exact", head: true });
      setSupabaseStatus(error ? "미연결" : "연결됨");
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'settings.supabase.healthcheck' } });
      setSupabaseStatus("미연결");
    }
  }, []);

  const checkFastapi = useCallback(async () => {
    setFastapiStatus("확인 중...");
    try {
      const res = await fetch("/api/health/fastapi", { cache: "no-store" });
      const data: { healthy: boolean } = await res.json();
      setFastapiStatus(data.healthy ? "연결됨" : "미연결");
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'settings.fastapi.healthcheck' } });
      setFastapiStatus("미연결");
    }
  }, []);

  useEffect(() => {
    checkSupabase();
    checkFastapi();
  }, [checkSupabase, checkFastapi]);

  const supabaseStatusColor = statusDotClass(supabaseStatus);
  const fastapiStatusColor = statusDotClass(fastapiStatus);

  const systemInfo = {
    version: "0.1.0",
    environment: process.env.NODE_ENV ?? "development",
    nextVersion: "14.2",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>시스템 정보</CardTitle>
        <CardDescription>The Master OS 시스템 상태를 확인합니다</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">버전</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">v{systemInfo.version}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">환경</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{systemInfo.environment}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Next.js</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">v{systemInfo.nextVersion}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Node.js</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {typeof process !== "undefined" ? process.version : "N/A"}
            </p>
          </div>
        </div>

        {/* 연결 상태 */}
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-700">외부 서비스 상태</h4>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${supabaseStatusColor}`} />
              <span className="text-sm text-gray-700">Supabase (PostgreSQL + Auth)</span>
            </div>
            <span className="text-xs text-gray-400">{supabaseStatus}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${fastapiStatusColor}`} />
              <span className="text-sm text-gray-700">FastAPI (Orchestration Engine)</span>
            </div>
            <span className="text-xs text-gray-400">{fastapiStatus}</span>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-4">
          <Button variant="ghost" size="sm" onClick={() => { checkSupabase(); checkFastapi(); }}>
            <ExternalLink className="h-4 w-4" />
            시스템 헬스체크 실행
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// -- 메인 설정 페이지 --
export default function SettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">설정</h2>
      <p className="mt-1 text-gray-500">시스템 전역 설정을 관리합니다</p>

      <Tabs defaultValue="profile" className="mt-6">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            프로필
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            보안
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            시스템
          </TabsTrigger>
          <TabsTrigger value="infra" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            인프라
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="security">
          <MFASection />
        </TabsContent>
        <TabsContent value="system">
          <SystemInfoSection />
        </TabsContent>
        <TabsContent value="infra">
          <InfraSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
