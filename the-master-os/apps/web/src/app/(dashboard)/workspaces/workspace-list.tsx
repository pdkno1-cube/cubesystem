'use client';

import { useEffect, useState, useCallback } from 'react';
import { LayoutGrid, List, Plus, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { WorkspaceCard } from './workspace-card';
import { CreateWorkspaceDialog } from './create-workspace-dialog';
import { PageHero } from '@/components/ui/PageHero';
import type { WorkspaceWithStats } from '@/types/workspace';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';

interface WorkspaceListClientProps {
  initialWorkspaces: WorkspaceWithStats[];
}

export function WorkspaceListClient({
  initialWorkspaces,
}: WorkspaceListClientProps) {
  const {
    workspaces,
    setWorkspaces,
    fetchWorkspaces,
    showArchived,
    setShowArchived,
  } = useWorkspaceStore();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Seed store with server-rendered data on mount
  useEffect(() => {
    setWorkspaces(initialWorkspaces);
  }, [initialWorkspaces, setWorkspaces]);

  const handleCreated = useCallback(() => {
    setIsCreateOpen(false);
    // Refetch to get accurate server data (optimistic already applied)
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleToggleArchived = useCallback(() => {
    const nextShowArchived = !showArchived;
    setShowArchived(nextShowArchived);
    void fetchWorkspaces(nextShowArchived);
  }, [showArchived, setShowArchived, fetchWorkspaces]);

  // Filter workspaces based on archived toggle for display
  const displayedWorkspaces = showArchived
    ? workspaces
    : workspaces.filter((ws) => ws.status !== 'archived');

  return (
    <div className="space-y-6">
      {/* Hero */}
      <PageHero
        badge="워크스페이스 관리"
        title="워크스페이스"
        subtitle="법인 워크스페이스를 생성하고 관리합니다"
        variant="indigo"
        stats={[
          { label: '전체', value: displayedWorkspaces.length },
        ]}
      />

      {/* Controls Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Archived Toggle */}
          <button
            type="button"
            onClick={handleToggleArchived}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
              showArchived
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50',
            )}
            aria-label={showArchived ? '아카이브 숨기기' : '아카이브 보기'}
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? '아카이브 포함' : '아카이브'}
          </button>

          {/* View Toggle */}
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            <button
              type="button"
              onClick={() => { setViewMode('grid'); }}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'grid'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-400 hover:text-gray-600',
              )}
              aria-label="카드 뷰"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('list'); }}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'list'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-400 hover:text-gray-600',
              )}
              aria-label="리스트 뷰"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Create Button */}
        <Button onClick={() => { setIsCreateOpen(true); }}>
          <Plus className="h-4 w-4" />
          새 법인 생성
        </Button>
      </div>

      {/* Content */}
      {displayedWorkspaces.length === 0 ? (
        <EmptyState onCreateClick={() => { setIsCreateOpen(true); }} />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedWorkspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {displayedWorkspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} viewMode="list" />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreateWorkspaceDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <Plus className="h-6 w-6 text-gray-400" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-900">
        아직 워크스페이스가 없습니다
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        새 법인 워크스페이스를 생성하여 에이전트를 배치해 보세요.
      </p>
      <Button className="mt-4" onClick={onCreateClick}>
        <Plus className="h-4 w-4" />
        새 법인 생성
      </Button>
    </div>
  );
}
