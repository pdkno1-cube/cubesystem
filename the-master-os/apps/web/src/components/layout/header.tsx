'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, Settings, LogOut, ChevronDown, Shield } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title?: string;
}

const ROLE_CONFIG: Record<
  'owner' | 'admin' | 'member' | 'viewer',
  { label: string; color: string; bgColor: string }
> = {
  owner:  { label: '오너',   color: 'text-purple-700', bgColor: 'bg-purple-50' },
  admin:  { label: '관리자', color: 'text-blue-700',   bgColor: 'bg-blue-50'   },
  member: { label: '멤버',   color: 'text-green-700',  bgColor: 'bg-green-50'  },
  viewer: { label: '뷰어',   color: 'text-gray-600',   bgColor: 'bg-gray-100'  },
};

function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Header({ title }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    router.push('/login');
  };

  const roleConfig = user?.role ? ROLE_CONFIG[user.role] : null;

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
        </button>

        {/* 프로필 드롭다운 */}
        <DropdownMenu.Root open={isProfileOpen} onOpenChange={setIsProfileOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {/* 아바타 */}
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-semibold">
                  {user?.displayName ? getInitials(user.displayName) : '?'}
                </div>
              )}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-gray-400 transition-transform',
                  isProfileOpen ? 'rotate-180' : ''
                )}
              />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 w-64 rounded-xl border border-gray-200 bg-white shadow-lg"
              sideOffset={8}
              align="end"
            >
              {/* 유저 정보 헤더 */}
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  {user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-sm font-semibold">
                      {user?.displayName ? getInitials(user.displayName) : '?'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {user?.displayName ?? '사용자'}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {user?.email ?? ''}
                    </p>
                  </div>
                </div>
                {/* 역할 뱃지 */}
                {roleConfig ? (
                  <div className="mt-2 flex items-center gap-1">
                    <Shield className="h-3 w-3 text-gray-400" />
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                        roleConfig.bgColor,
                        roleConfig.color
                      )}
                    >
                      {roleConfig.label}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* 메뉴 아이템 */}
              <div className="p-1">
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                  onSelect={() => {
                    router.push('/settings');
                  }}
                >
                  <Settings className="h-4 w-4 text-gray-400" />
                  설정
                </DropdownMenu.Item>
              </div>

              <DropdownMenu.Separator className="h-px bg-gray-100" />

              <div className="p-1">
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                  onSelect={() => {
                    void handleLogout();
                  }}
                  disabled={isLoggingOut}
                >
                  <LogOut className="h-4 w-4" />
                  {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
                </DropdownMenu.Item>
              </div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
