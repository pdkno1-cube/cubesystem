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
  Server,
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
  { href: "/infra-cost", label: "인프라 비용", icon: Server },
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
        <div className="flex h-[76px] items-center px-4">
          <Link
            href="/dashboard"
            className="group flex items-center gap-3.5 rounded-2xl px-3 py-2.5 transition-all duration-200 hover:bg-white/10"
          >
            {/* Cube icon */}
            <div
              className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl shadow-xl ring-1 ring-white/20"
              style={{
                background:
                  'linear-gradient(145deg, #818cf8 0%, #4f46e5 45%, #312e81 100%)',
              }}
            >
              {/* Inner top-left glow */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />

              <svg
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="relative h-8 w-8"
              >
                <defs>
                  <linearGradient id="logo-top" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity="1" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.82" />
                  </linearGradient>
                  <linearGradient
                    id="logo-right"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="white" stopOpacity="0.68" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.32" />
                  </linearGradient>
                  <linearGradient id="logo-left" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity="0.38" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.12" />
                  </linearGradient>
                </defs>

                {/* Top face */}
                <path
                  d="M16 4L28 11V12L16 19L4 12V11L16 4Z"
                  fill="url(#logo-top)"
                />
                {/* Left face */}
                <path
                  d="M4 12L16 19V28L4 21V12Z"
                  fill="url(#logo-left)"
                />
                {/* Right face */}
                <path
                  d="M28 12V21L16 28V19L28 12Z"
                  fill="url(#logo-right)"
                />
                {/* Outer edge */}
                <path
                  d="M16 4L28 11V21L16 28L4 21V11L16 4Z"
                  stroke="white"
                  strokeWidth="0.6"
                  strokeOpacity="0.45"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Inner edges */}
                <path
                  d="M16 19V28M4 12L16 19L28 12"
                  stroke="white"
                  strokeWidth="0.5"
                  strokeOpacity="0.35"
                />
              </svg>
            </div>

            {/* Text */}
            <div className="flex flex-col leading-none">
              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40">
                The
              </span>
              <span className="mt-1 text-[15px] font-bold tracking-tight text-white">
                Master OS
              </span>
            </div>
          </Link>
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
