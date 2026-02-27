import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleChannel =
  | 'instagram'
  | 'newsletter'
  | 'twitter'
  | 'linkedin'
  | 'blog'
  | 'shortform';

export type ScheduleStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ScheduleItem {
  id: string;
  workspace_id: string;
  pipeline_id: string | null;
  channel: ScheduleChannel;
  title: string;
  content: Record<string, unknown>;
  status: ScheduleStatus;
  scheduled_at: string;
  published_at: string | null;
  recurrence: string;
  tags: string[];
  created_at: string;
}

interface MarketingState {
  // Calendar view
  viewYear: number;
  viewMonth: number; // 0-indexed (0=Jan, 11=Dec)

  // Data
  schedules: ScheduleItem[];
  isLoading: boolean;

  // Selection
  selectedDate: string | null; // YYYY-MM-DD
  selectedSchedule: ScheduleItem | null;

  // UI panels
  isSliderOpen: boolean;
  isCreateOpen: boolean;

  // Workspace context
  workspaceId: string | null;

  // Actions
  setSchedules: (schedules: ScheduleItem[]) => void;
  setLoading: (loading: boolean) => void;
  setViewMonth: (year: number, month: number) => void;
  prevMonth: () => void;
  nextMonth: () => void;
  selectDate: (date: string | null) => void;
  selectSchedule: (schedule: ScheduleItem | null) => void;
  openSlider: (schedule: ScheduleItem) => void;
  closeSlider: () => void;
  openCreate: (date?: string) => void;
  closeCreate: () => void;
  updateScheduleStatus: (id: string, status: ScheduleStatus) => void;
  moveSchedule: (id: string, newDate: string) => void;
  removeSchedule: (id: string) => void;
  addSchedule: (schedule: ScheduleItem) => void;
  setWorkspaceId: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const now = new Date();

export const useMarketingStore = create<MarketingState>()((set) => ({
  viewYear: now.getFullYear(),
  viewMonth: now.getMonth(),
  schedules: [],
  isLoading: false,
  selectedDate: null,
  selectedSchedule: null,
  isSliderOpen: false,
  isCreateOpen: false,
  workspaceId: null,

  setSchedules: (schedules) => set({ schedules }),
  setLoading: (isLoading) => set({ isLoading }),

  setViewMonth: (viewYear, viewMonth) => set({ viewYear, viewMonth }),

  prevMonth: () =>
    set((state) => {
      const d = new Date(state.viewYear, state.viewMonth - 1, 1);
      return { viewYear: d.getFullYear(), viewMonth: d.getMonth() };
    }),

  nextMonth: () =>
    set((state) => {
      const d = new Date(state.viewYear, state.viewMonth + 1, 1);
      return { viewYear: d.getFullYear(), viewMonth: d.getMonth() };
    }),

  selectDate: (selectedDate) => set({ selectedDate }),

  selectSchedule: (selectedSchedule) => set({ selectedSchedule }),

  openSlider: (schedule) =>
    set({ selectedSchedule: schedule, isSliderOpen: true }),

  closeSlider: () => set({ isSliderOpen: false, selectedSchedule: null }),

  openCreate: (date) =>
    set({ isCreateOpen: true, selectedDate: date ?? null }),

  closeCreate: () => set({ isCreateOpen: false }),

  updateScheduleStatus: (id, status) =>
    set((state) => ({
      schedules: state.schedules.map((s) =>
        s.id === id ? { ...s, status } : s,
      ),
      selectedSchedule:
        state.selectedSchedule?.id === id
          ? { ...state.selectedSchedule, status }
          : state.selectedSchedule,
    })),

  moveSchedule: (id, newDate) =>
    set((state) => ({
      schedules: state.schedules.map((s) => {
        if (s.id !== id) return s;
        // Keep the original time, only change the date part
        const orig = new Date(s.scheduled_at);
        const [y = 0, m = 0, d = 0] = newDate.split('-').map(Number);
        const updated = new Date(
          y,
          m - 1,
          d,
          orig.getHours(),
          orig.getMinutes(),
        );
        return { ...s, scheduled_at: updated.toISOString() };
      }),
    })),

  removeSchedule: (id) =>
    set((state) => ({
      schedules: state.schedules.filter((s) => s.id !== id),
      isSliderOpen: state.selectedSchedule?.id === id ? false : state.isSliderOpen,
      selectedSchedule:
        state.selectedSchedule?.id === id ? null : state.selectedSchedule,
    })),

  addSchedule: (schedule) =>
    set((state) => ({ schedules: [...state.schedules, schedule] })),

  setWorkspaceId: (workspaceId) => set({ workspaceId }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Returns schedules grouped by YYYY-MM-DD date string. */
export function groupByDate(
  schedules: ScheduleItem[],
): Record<string, ScheduleItem[]> {
  const result: Record<string, ScheduleItem[]> = {};
  for (const s of schedules) {
    const dateKey = s.scheduled_at.slice(0, 10); // YYYY-MM-DD
    if (!result[dateKey]) result[dateKey] = [];
    result[dateKey].push(s);
  }
  return result;
}

/** Channel → Tailwind color classes. */
export const CHANNEL_COLORS: Record<
  ScheduleChannel,
  { bg: string; text: string; dot: string; label: string }
> = {
  blog: {
    bg: 'bg-blue-50 border border-blue-200',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
    label: '블로그',
  },
  instagram: {
    bg: 'bg-pink-50 border border-pink-200',
    text: 'text-pink-700',
    dot: 'bg-pink-500',
    label: '인스타',
  },
  newsletter: {
    bg: 'bg-green-50 border border-green-200',
    text: 'text-green-700',
    dot: 'bg-green-500',
    label: '뉴스레터',
  },
  shortform: {
    bg: 'bg-purple-50 border border-purple-200',
    text: 'text-purple-700',
    dot: 'bg-purple-500',
    label: '숏폼',
  },
  twitter: {
    bg: 'bg-sky-50 border border-sky-200',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
    label: '트위터',
  },
  linkedin: {
    bg: 'bg-indigo-50 border border-indigo-200',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
    label: '링크드인',
  },
};

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  pending: '예약됨',
  running: '발행 중',
  completed: '발행 완료',
  failed: '실패',
  cancelled: '취소됨',
};
