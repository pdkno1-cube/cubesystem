"use client";

import { useState, useCallback, useEffect } from "react";
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
  Gavel,
  ClipboardCheck,
  HeartPulse,
  MessageSquare,
  BookOpen,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/workspaces", label: "워크스페이스", icon: Building2 },
  { href: "/agents", label: "에이전트", icon: Bot },
  { href: "/pipelines", label: "파이프라인", icon: GitBranch },
  { href: "/grants", label: "조달입찰", icon: Gavel },
  { href: "/documents", label: "문서검증", icon: ClipboardCheck },
  { href: "/debates", label: "토론", icon: MessageSquare },
  { href: "/business-plans", label: "사업계획서", icon: BookOpen },
  { href: "/marketing", label: "마케팅 캘린더", icon: CalendarDays },
  { href: "/healing", label: "자동치유", icon: HeartPulse },
  { href: "/billing", label: "크레딧", icon: CreditCard },
  { href: "/vault", label: "시크릿 볼트", icon: Shield },
  { href: "/audit-logs", label: "감사 로그", icon: FileText },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        className="fixed left-4 top-4 z-50 rounded-lg bg-sidebar-bg p-2 text-white shadow-lg md:hidden"
        onClick={toggle}
        aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={isOpen}
        aria-controls="main-sidebar"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay (mobile only) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="main-sidebar"
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-sidebar-bg",
          "transform transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0", // Desktop: always visible
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center px-6">
          <span className="text-xl font-bold text-white">The Master OS</span>
        </div>

        {/* Navigation */}
        <nav
          role="navigation"
          aria-label="메인 네비게이션"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
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

        {/* System status */}
        <div className="border-t border-gray-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse-dot" />
            <span className="text-xs text-sidebar-text">시스템 정상</span>
          </div>
        </div>
      </aside>
    </>
  );
}
