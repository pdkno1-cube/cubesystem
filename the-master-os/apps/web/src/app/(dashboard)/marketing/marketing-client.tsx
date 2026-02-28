'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ChevronLeft, ChevronRight, Loader2, CalendarDays, BarChart3, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { CalendarGrid } from '@/components/marketing/CalendarGrid';
import { ContentPreviewSlider } from '@/components/marketing/ContentPreviewSlider';
import { AnalyticsPanel } from '@/components/marketing/AnalyticsPanel';
import {
  useMarketingStore,
  type ScheduleItem,
  type MarketingTab,
  CHANNEL_COLORS,
  STATUS_LABELS,
} from '@/stores/marketingStore';
import { MediaGeneratorDialog } from '@/components/marketing/MediaGeneratorDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketingClientProps {
  initialSchedules: ScheduleItem[];
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Channel legend
// ---------------------------------------------------------------------------

function ChannelLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {Object.entries(CHANNEL_COLORS).map(([channel, colors]) => (
        <span key={channel} className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className={clsx('h-2.5 w-2.5 rounded-full', colors.dot)} />
          {colors.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly summary bar
// ---------------------------------------------------------------------------

function MonthlySummary({ schedules }: { schedules: ScheduleItem[] }) {
  const completedCount = schedules.filter((s) => s.status === 'completed').length;
  const pendingCount = schedules.filter((s) => s.status === 'pending').length;
  const failedCount = schedules.filter((s) => s.status === 'failed').length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-xs text-gray-500">이번 달 전체</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{schedules.length}</p>
      </div>
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-xs text-green-600">발행 완료</p>
        <p className="mt-1 text-2xl font-bold text-green-700">{completedCount}</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-600">예약됨</p>
        <p className="mt-1 text-2xl font-bold text-amber-700">{pendingCount}</p>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-xs text-red-600">실패</p>
        <p className="mt-1 text-2xl font-bold text-red-700">{failedCount}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selected day panel
// ---------------------------------------------------------------------------

function SelectedDayPanel({
  date,
  items,
  onItemClick,
}: {
  date: string | null;
  items: ScheduleItem[];
  onItemClick: (item: ScheduleItem) => void;
}) {
  if (!date) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 py-8 text-sm text-gray-400">
        날짜를 클릭하면 예약 목록을 확인할 수 있습니다
      </div>
    );
  }

  const [y = 0, m = 0, d = 0] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{label}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">예약된 콘텐츠 없음</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const colors = CHANNEL_COLORS[item.channel] ?? CHANNEL_COLORS.blog;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onItemClick(item)}
                  className={clsx(
                    'flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left',
                    'hover:bg-gray-50 transition-colors',
                  )}
                >
                  <span className={clsx('mt-1 h-2 w-2 shrink-0 rounded-full', colors.dot)} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{item.title}</p>
                    <p className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className={clsx(colors.text)}>{colors.label}</span>
                      <span>·</span>
                      <span>{STATUS_LABELS[item.status] ?? item.status}</span>
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarketingClient (main)
// ---------------------------------------------------------------------------

export function MarketingClient({
  initialSchedules,
  workspaceId,
}: MarketingClientProps) {
  const {
    activeTab,
    setActiveTab,
    viewYear,
    viewMonth,
    schedules,
    selectedDate,
    selectedSchedule,
    isSliderOpen,
    prevMonth,
    nextMonth,
    setSchedules,
    selectDate,
    openSlider,
    closeSlider,
    updateScheduleStatus,
    moveSchedule,
    setWorkspaceId,
  } = useMarketingStore();

  const [isRefetching, setIsRefetching] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);

  // Initialise store on mount
  useEffect(() => {
    setSchedules(initialSchedules);
    setWorkspaceId(workspaceId);
  }, [initialSchedules, workspaceId, setSchedules, setWorkspaceId]);

  // Fetch schedules when month changes
  const fetchSchedules = useCallback(
    async (year: number, month: number) => {
      setIsRefetching(true);
      try {
        const params = new URLSearchParams({
          workspace_id: workspaceId,
          // Fetch entire month
          page: '1',
          limit: '200',
        });
        const resp = await fetch(`/api/marketing/schedules?${params.toString()}`);
        if (resp.ok) {
          const data = (await resp.json()) as { data: ScheduleItem[] };
          // Filter client-side to current month
          const filtered = data.data.filter((s) => {
            const d = new Date(s.scheduled_at);
            return d.getFullYear() === year && d.getMonth() === month;
          });
          setSchedules(filtered);
        }
      } finally {
        setIsRefetching(false);
      }
    },
    [workspaceId, setSchedules],
  );

  useEffect(() => {
    void fetchSchedules(viewYear, viewMonth);
  }, [viewYear, viewMonth, fetchSchedules]);

  // Drag-and-drop: update scheduled_at date
  const handleItemDrop = useCallback(
    async (scheduleId: string, newDate: string) => {
      moveSchedule(scheduleId, newDate);
      // Find the updated scheduled_at from store
      const item = schedules.find((s) => s.id === scheduleId);
      if (!item) {
        return;
      }

      const orig = new Date(item.scheduled_at);
      const [y = 0, m = 0, d = 0] = newDate.split('-').map(Number);
      const updated = new Date(y, m - 1, d, orig.getHours(), orig.getMinutes());

      try {
        const resp = await fetch(`/api/marketing/schedules/${scheduleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_at: updated.toISOString() }),
        });
        if (!resp.ok) {
          const errBody = await resp.text();
          Sentry.captureMessage(`Schedule drop PATCH failed: ${resp.status} ${errBody}`, {
            level: 'error',
            tags: { context: 'marketing.schedule.drop' },
            extra: { scheduleId, newDate, status: resp.status },
          });
          void fetchSchedules(viewYear, viewMonth);
        }
      } catch (error) {
        Sentry.captureException(error, { tags: { context: 'marketing.schedule.drop' } });
        // Revert on failure (best-effort)
        void fetchSchedules(viewYear, viewMonth);
      }
    },
    [schedules, moveSchedule, fetchSchedules, viewYear, viewMonth],
  );

  // Cancel schedule
  const handleCancelSchedule = useCallback(
    async (id: string) => {
      updateScheduleStatus(id, 'cancelled');
      closeSlider();
      try {
        await fetch(`/api/marketing/schedules/${id}`, {
          method: 'DELETE',
        });
      } catch (error) {
        Sentry.captureException(error, { tags: { context: 'marketing.schedule.cancel' } });
        void fetchSchedules(viewYear, viewMonth);
      }
    },
    [updateScheduleStatus, closeSlider, fetchSchedules, viewYear, viewMonth],
  );

  // Publish content now (all channels via unified /api/marketing/publish)
  const handleSendNow = useCallback(
    async (id: string) => {
      const item = schedules.find((s) => s.id === id);
      if (!item) {
        return;
      }

      updateScheduleStatus(id, 'running');
      try {
        const resp = await fetch('/api/marketing/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduleId: id,
            channel: item.channel,
          }),
        });

        const result = await resp.json() as {
          data: {
            success: boolean;
            status: 'published' | 'not_configured' | 'error' | 'manual';
            message: string;
          };
        };

        if (result.data.success) {
          updateScheduleStatus(id, 'completed');
          closeSlider();
        } else if (result.data.status === 'not_configured') {
          updateScheduleStatus(id, 'pending');
          Sentry.addBreadcrumb({
            category: 'marketing.publish',
            message: result.data.message,
            level: 'info',
          });
        } else {
          updateScheduleStatus(id, 'failed');
          Sentry.captureMessage(`Publish failed: ${result.data.message}`, {
            level: 'error',
            tags: { context: 'marketing.publish', channel: item.channel },
          });
        }
      } catch (error) {
        Sentry.captureException(error, { tags: { context: 'marketing.publish' } });
        updateScheduleStatus(id, 'failed');
      }
    },
    [schedules, updateScheduleStatus, closeSlider],
  );

  // Month navigation label
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  });

  // Items for the selected date
  const selectedDayItems = selectedDate
    ? schedules.filter((s) => s.scheduled_at.startsWith(selectedDate))
    : [];

  const tabs: { key: MarketingTab; label: string; icon: typeof CalendarDays }[] = [
    { key: 'calendar', label: '캘린더', icon: CalendarDays },
    { key: 'analytics', label: '성과 분석', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header + tab switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">마케팅</h1>
          <p className="text-sm text-gray-500">
            OSMU 마케팅 파이프라인 콘텐츠 발행 일정 및 성과를 관리합니다
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMediaDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-700 hover:to-indigo-700"
          >
            <Sparkles className="h-4 w-4" />
            AI 미디어 생성
          </button>
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Media generator dialog */}
      <MediaGeneratorDialog
        open={isMediaDialogOpen}
        onClose={() => setIsMediaDialogOpen(false)}
      />

      {/* Tab content */}
      {activeTab === 'analytics' ? (
        <AnalyticsPanel workspaceId={workspaceId} />
      ) : (
        <>
          {/* Monthly summary */}
          <MonthlySummary schedules={schedules} />

          {/* Calendar section */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
            <div className="flex flex-col gap-3">
              {/* Calendar toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={prevMonth}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                    aria-label="이전 달"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[120px] text-center text-base font-semibold text-gray-800">
                    {monthLabel}
                  </span>
                  <button
                    onClick={nextMonth}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                    aria-label="다음 달"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  {isRefetching && (
                    <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <ChannelLegend />
                </div>
              </div>

              {/* Calendar grid */}
              <CalendarGrid
                year={viewYear}
                month={viewMonth}
                schedules={schedules}
                selectedDate={selectedDate}
                onDayClick={selectDate}
                onItemClick={openSlider}
                onItemDrop={handleItemDrop}
              />
            </div>

            {/* Right panel: selected day items */}
            <SelectedDayPanel
              date={selectedDate}
              items={selectedDayItems}
              onItemClick={openSlider}
            />
          </div>

          {/* Content preview slider */}
          <ContentPreviewSlider
            schedule={selectedSchedule}
            isOpen={isSliderOpen}
            onClose={closeSlider}
            onCancelSchedule={handleCancelSchedule}
            onSendNow={handleSendNow}
          />
        </>
      )}
    </div>
  );
}
