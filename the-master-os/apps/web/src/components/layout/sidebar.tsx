"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Building2,
  Bot,
  GitBranch,
  CreditCard,
  Shield,
  FileText,
  Settings,
  CalendarDays,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/workspaces", label: "워크스페이스", icon: Building2 },
  { href: "/agents", label: "에이전트", icon: Bot },
  { href: "/pipelines", label: "파이프라인", icon: GitBranch },
  { href: "/marketing", label: "마케팅 캘린더", icon: CalendarDays },
  { href: "/billing", label: "크레딧", icon: CreditCard },
  { href: "/vault", label: "시크릿 볼트", icon: Shield },
  { href: "/audit-logs", label: "감사 로그", icon: FileText },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar-bg">
      {/* 로고 영역 */}
      <div className="flex h-16 items-center px-6">
        <span className="text-xl font-bold text-white">The Master OS</span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-sidebar-text-active"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 하단 시스템 상태 */}
      <div className="border-t border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse-dot" />
          <span className="text-xs text-sidebar-text">시스템 정상</span>
        </div>
      </div>
    </aside>
  );
}
