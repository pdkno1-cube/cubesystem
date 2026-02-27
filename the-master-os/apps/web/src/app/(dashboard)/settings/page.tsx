"use client";

import { useState, useEffect, useCallback } from "react";
import { User, Shield, Info, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

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

// -- MFA 관리 섹션 --
function MFASection() {
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkMfaStatus() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.mfa.listFactors();
        const totpFactors = data?.totp ?? [];
        setMfaEnrolled(totpFactors.length > 0);
      } catch {
        setMfaEnrolled(false);
      } finally {
        setChecking(false);
      }
    }
    checkMfaStatus();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>다단계 인증 (MFA)</CardTitle>
        <CardDescription>TOTP 기반 2단계 인증을 관리합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
          <div>
            <p className="font-medium text-gray-900">TOTP 인증기</p>
            <p className="text-sm text-gray-500">
              Google Authenticator, Authy 등 TOTP 앱을 사용합니다
            </p>
          </div>
          {checking ? (
            <div className="h-6 w-11 animate-pulse rounded-full bg-gray-200" />
          ) : (
            <div
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                mfaEnrolled
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {mfaEnrolled ? "활성" : "미등록"}
            </div>
          )}
        </div>

        {!mfaEnrolled && !checking && (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4">
            <p className="text-sm text-amber-700">
              MFA가 등록되지 않았습니다. 보안을 위해 TOTP 인증을 활성화하세요.
            </p>
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
    } catch {
      setSupabaseStatus("미연결");
    }
  }, []);

  const checkFastapi = useCallback(async () => {
    setFastapiStatus("확인 중...");
    try {
      const res = await fetch("/api/health/fastapi", { cache: "no-store" });
      const data: { healthy: boolean } = await res.json();
      setFastapiStatus(data.healthy ? "연결됨" : "미연결");
    } catch {
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
      </Tabs>
    </div>
  );
}
