"use client";

import { Bell, Search, User } from "lucide-react";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 pl-14 pr-6 md:px-6 backdrop-blur-sm">
      {/* 좌측: 페이지 타이틀 */}
      <div>
        {title ? (
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        ) : null}
      </div>

      {/* 우측: 검색 + 알림 + 프로필 */}
      <div className="flex items-center gap-4">
        {/* 검색 */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:border-gray-300 transition-colors"
        >
          <Search className="h-4 w-4" />
          <span>검색...</span>
          <kbd className="ml-2 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">
            Ctrl+K
          </kbd>
        </button>

        {/* 알림 */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {/* Notification badge — will connect when notification system is implemented */}
        </button>

        {/* 프로필 */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
            <User className="h-4 w-4" />
          </div>
        </button>
      </div>
    </header>
  );
}
