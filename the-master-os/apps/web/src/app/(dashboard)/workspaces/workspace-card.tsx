'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import {
  Building2,
  Truck,
  Monitor,
  UtensilsCrossed,
  ShoppingCart,
  Megaphone,
  Landmark,
  Briefcase,
  Bot,
  GitBranch,
  MoreVertical,
  Pencil,
  Archive,
  type LucideIcon,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { cn } from '@/lib/utils';
import type { WorkspaceWithStats, WorkspaceCategory } from '@/types/workspace';
import { EditWorkspaceDialog } from './edit-workspace-dialog';

// ── Icon map ───────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  Truck,
  Monitor,
  UtensilsCrossed,
  ShoppingCart,
  Megaphone,
  Landmark,
  Briefcase,
};

function getWorkspaceIcon(iconName?: string): LucideIcon {
  if (iconName && iconName in ICON_MAP) {
    return ICON_MAP[iconName]!;
  }
  return Building2;
}

// ── Category badge config ──────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }
> = {
  logistics: { label: '물류', variant: 'info' },
  it: { label: 'IT', variant: 'purple' },
  fnb: { label: 'F&B', variant: 'warning' },
  ecommerce: { label: 'E-commerce', variant: 'success' },
  marketing: { label: '마케팅', variant: 'primary' },
  finance: { label: '금융', variant: 'danger' },
  other: { label: '기타', variant: 'default' },
};

function getCategoryBadge(category?: WorkspaceCategory | string) {
  const config = category ? CATEGORY_CONFIG[category] : undefined;
  return config ?? { label: '기타', variant: 'default' as const };
}

// ── Component ──────────────────────────────────────────────────────

interface WorkspaceCardProps {
  workspace: WorkspaceWithStats;
  viewMode?: 'grid' | 'list';
}

export function WorkspaceCard({
  workspace,
  viewMode = 'grid',
}: WorkspaceCardProps) {
  const router = useRouter();
  const { archiveWorkspace } = useWorkspaceStore();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const Icon = getWorkspaceIcon(workspace.icon);
  const categoryBadge = getCategoryBadge(workspace.category);

  const handleClick = useCallback(() => {
    router.push(`/workspaces/${workspace.id}`);
  }, [router, workspace.id]);

  const handleArchive = useCallback(async () => {
    setIsArchiving(true);
    try {
      await archiveWorkspace(workspace.id);
    } finally {
      setIsArchiving(false);
    }
  }, [archiveWorkspace, workspace.id]);

  const formattedDate = new Date(workspace.created_at).toLocaleDateString(
    'ko-KR',
    { year: 'numeric', month: 'short', day: 'numeric' },
  );

  if (viewMode === 'list') {
    return (
      <>
        <div
          className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition-shadow hover:shadow-md"
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {handleClick();}
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <Icon className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {workspace.name}
              </h3>
              <p className="text-xs text-gray-500">{formattedDate}</p>
            </div>
            <Badge variant={categoryBadge.variant}>{categoryBadge.label}</Badge>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Bot className="h-3.5 w-3.5" />
              <span>{workspace.agent_count}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <GitBranch className="h-3.5 w-3.5" />
              <span>{workspace.active_pipeline_count}</span>
            </div>
            <CardMenu
              onEdit={() => setIsEditOpen(true)}
              onArchive={handleArchive}
              isArchiving={isArchiving}
            />
          </div>
        </div>

        <EditWorkspaceDialog
          workspace={workspace}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
        />
      </>
    );
  }

  // Grid view (default)
  return (
    <>
      <div
        className={cn(
          'group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-lg',
          isArchiving && 'pointer-events-none opacity-50',
        )}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {handleClick();}
        }}
        role="button"
        tabIndex={0}
      >
        {/* Top row: icon + name + menu */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <Icon className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {workspace.name}
              </h3>
              <Badge variant={categoryBadge.variant} className="mt-1">
                {categoryBadge.label}
              </Badge>
            </div>
          </div>
          <CardMenu
            onEdit={() => setIsEditOpen(true)}
            onArchive={handleArchive}
            isArchiving={isArchiving}
          />
        </div>

        {/* Description */}
        {workspace.description ? (
          <p className="mt-3 line-clamp-2 text-xs text-gray-500">
            {workspace.description}
          </p>
        ) : null}

        {/* Stats */}
        <div className="mt-4 flex items-center gap-4 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Bot className="h-3.5 w-3.5" />
            <span>에이전트 {workspace.agent_count}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <GitBranch className="h-3.5 w-3.5" />
            <span>파이프라인 {workspace.active_pipeline_count}</span>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-2 text-xs text-gray-400">{formattedDate}</p>
      </div>

      <EditWorkspaceDialog
        workspace={workspace}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
    </>
  );
}

// ── Dropdown Menu ──────────────────────────────────────────────────

interface CardMenuProps {
  onEdit: () => void;
  onArchive: () => void;
  isArchiving: boolean;
}

function CardMenu({ onEdit, onArchive, isArchiving }: CardMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={(e) => e.stopPropagation()}
          aria-label="더보기"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[140px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 outline-none hover:bg-gray-100"
            onSelect={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            수정
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-gray-100" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 outline-none hover:bg-red-50"
            onSelect={onArchive}
            disabled={isArchiving}
          >
            <Archive className="h-3.5 w-3.5" />
            아카이브
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
