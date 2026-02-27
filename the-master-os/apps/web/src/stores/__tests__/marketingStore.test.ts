/**
 * Unit tests for marketingStore — pure Zustand state logic.
 *
 * Tests cover:
 *   - groupByDate selector
 *   - prevMonth / nextMonth (including year wrap)
 *   - moveSchedule (date change, time preserved)
 *   - removeSchedule (removes item, closes slider when selected)
 *   - updateScheduleStatus (updates list and selectedSchedule)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHANNEL_COLORS,
  STATUS_LABELS,
  groupByDate,
  useMarketingStore,
  type ScheduleItem,
} from '../marketingStore';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSchedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'sched-1',
    workspace_id: 'ws-1',
    pipeline_id: null,
    channel: 'newsletter',
    title: 'Test Schedule',
    content: {},
    status: 'pending',
    scheduled_at: '2026-03-15T09:00:00.000Z',
    published_at: null,
    recurrence: 'none',
    tags: [],
    created_at: '2026-02-27T00:00:00.000Z',
    ...overrides,
  };
}

// Reset store before each test
beforeEach(() => {
  useMarketingStore.setState({
    schedules: [],
    selectedSchedule: null,
    isSliderOpen: false,
    isCreateOpen: false,
    selectedDate: null,
    viewYear: 2026,
    viewMonth: 1, // February (0-indexed)
    isLoading: false,
    workspaceId: null,
  });
});

// ---------------------------------------------------------------------------
// groupByDate
// ---------------------------------------------------------------------------

describe('groupByDate', () => {
  it('returns empty object for empty array', () => {
    expect(groupByDate([])).toEqual({});
  });

  it('groups schedules by YYYY-MM-DD prefix', () => {
    const s1 = makeSchedule({ id: 's1', scheduled_at: '2026-03-15T09:00:00.000Z' });
    const s2 = makeSchedule({ id: 's2', scheduled_at: '2026-03-15T18:00:00.000Z' });
    const s3 = makeSchedule({ id: 's3', scheduled_at: '2026-03-20T10:00:00.000Z' });

    const grouped = groupByDate([s1, s2, s3]);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped['2026-03-15']).toHaveLength(2);
    expect(grouped['2026-03-20']).toHaveLength(1);
  });

  it('uses scheduled_at[:10] as key', () => {
    const s = makeSchedule({ scheduled_at: '2026-12-31T23:59:59.000Z' });
    const grouped = groupByDate([s]);
    expect('2026-12-31' in grouped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prevMonth / nextMonth
// ---------------------------------------------------------------------------

describe('prevMonth', () => {
  it('decrements month within same year', () => {
    useMarketingStore.setState({ viewYear: 2026, viewMonth: 5 });
    useMarketingStore.getState().prevMonth();
    const { viewYear, viewMonth } = useMarketingStore.getState();
    expect(viewYear).toBe(2026);
    expect(viewMonth).toBe(4);
  });

  it('wraps from January to December of previous year', () => {
    useMarketingStore.setState({ viewYear: 2026, viewMonth: 0 });
    useMarketingStore.getState().prevMonth();
    const { viewYear, viewMonth } = useMarketingStore.getState();
    expect(viewYear).toBe(2025);
    expect(viewMonth).toBe(11);
  });
});

describe('nextMonth', () => {
  it('increments month within same year', () => {
    useMarketingStore.setState({ viewYear: 2026, viewMonth: 5 });
    useMarketingStore.getState().nextMonth();
    const { viewYear, viewMonth } = useMarketingStore.getState();
    expect(viewYear).toBe(2026);
    expect(viewMonth).toBe(6);
  });

  it('wraps from December to January of next year', () => {
    useMarketingStore.setState({ viewYear: 2026, viewMonth: 11 });
    useMarketingStore.getState().nextMonth();
    const { viewYear, viewMonth } = useMarketingStore.getState();
    expect(viewYear).toBe(2027);
    expect(viewMonth).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// moveSchedule
// ---------------------------------------------------------------------------

describe('moveSchedule', () => {
  it('changes date but preserves original time', () => {
    const originalAt = '2026-03-15T09:30:00.000Z';
    const s = makeSchedule({ id: 's1', scheduled_at: originalAt });
    useMarketingStore.setState({ schedules: [s] });

    useMarketingStore.getState().moveSchedule('s1', '2026-03-22');

    const updated = useMarketingStore.getState().schedules[0]!;
    const orig = new Date(originalAt);
    const date = new Date(updated.scheduled_at);
    // Date should be March 22 in local time
    expect(date.getDate()).toBe(22);
    // Hours and minutes should be preserved (in local time, as the store uses getHours/getMinutes)
    expect(date.getHours()).toBe(orig.getHours());
    expect(date.getMinutes()).toBe(orig.getMinutes());
  });

  it('does not affect other schedules', () => {
    const s1 = makeSchedule({ id: 's1' });
    const s2 = makeSchedule({ id: 's2', scheduled_at: '2026-04-01T10:00:00.000Z' });
    useMarketingStore.setState({ schedules: [s1, s2] });

    useMarketingStore.getState().moveSchedule('s1', '2026-03-20');

    const s2After = useMarketingStore.getState().schedules.find((s) => s.id === 's2')!;
    expect(s2After.scheduled_at).toBe('2026-04-01T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// removeSchedule
// ---------------------------------------------------------------------------

describe('removeSchedule', () => {
  it('removes the schedule from the list', () => {
    const s1 = makeSchedule({ id: 's1' });
    const s2 = makeSchedule({ id: 's2' });
    useMarketingStore.setState({ schedules: [s1, s2] });

    useMarketingStore.getState().removeSchedule('s1');

    const { schedules } = useMarketingStore.getState();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.id).toBe('s2');
  });

  it('closes slider when removed schedule was selected', () => {
    const s = makeSchedule({ id: 's1' });
    useMarketingStore.setState({
      schedules: [s],
      selectedSchedule: s,
      isSliderOpen: true,
    });

    useMarketingStore.getState().removeSchedule('s1');

    const { isSliderOpen, selectedSchedule } = useMarketingStore.getState();
    expect(isSliderOpen).toBe(false);
    expect(selectedSchedule).toBeNull();
  });

  it('keeps slider open when a different schedule was selected', () => {
    const s1 = makeSchedule({ id: 's1' });
    const s2 = makeSchedule({ id: 's2' });
    useMarketingStore.setState({
      schedules: [s1, s2],
      selectedSchedule: s2,
      isSliderOpen: true,
    });

    useMarketingStore.getState().removeSchedule('s1');

    expect(useMarketingStore.getState().isSliderOpen).toBe(true);
    expect(useMarketingStore.getState().selectedSchedule?.id).toBe('s2');
  });
});

// ---------------------------------------------------------------------------
// updateScheduleStatus
// ---------------------------------------------------------------------------

describe('updateScheduleStatus', () => {
  it('updates the status in the schedules list', () => {
    const s = makeSchedule({ id: 's1', status: 'pending' });
    useMarketingStore.setState({ schedules: [s] });

    useMarketingStore.getState().updateScheduleStatus('s1', 'completed');

    const updated = useMarketingStore.getState().schedules[0]!;
    expect(updated.status).toBe('completed');
  });

  it('also updates selectedSchedule if it is the same item', () => {
    const s = makeSchedule({ id: 's1', status: 'pending' });
    useMarketingStore.setState({ schedules: [s], selectedSchedule: s });

    useMarketingStore.getState().updateScheduleStatus('s1', 'failed');

    expect(useMarketingStore.getState().selectedSchedule?.status).toBe('failed');
  });

  it('leaves selectedSchedule unchanged if it is a different item', () => {
    const s1 = makeSchedule({ id: 's1', status: 'pending' });
    const s2 = makeSchedule({ id: 's2', status: 'pending' });
    useMarketingStore.setState({ schedules: [s1, s2], selectedSchedule: s2 });

    useMarketingStore.getState().updateScheduleStatus('s1', 'completed');

    expect(useMarketingStore.getState().selectedSchedule?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------

describe('CHANNEL_COLORS', () => {
  it('has entries for all channels', () => {
    const channels = ['blog', 'instagram', 'newsletter', 'shortform', 'twitter', 'linkedin'];
    for (const ch of channels) {
      expect(CHANNEL_COLORS).toHaveProperty(ch);
    }
  });

  it('each entry has bg, text, dot, label keys', () => {
    for (const entry of Object.values(CHANNEL_COLORS)) {
      expect(entry).toHaveProperty('bg');
      expect(entry).toHaveProperty('text');
      expect(entry).toHaveProperty('dot');
      expect(entry).toHaveProperty('label');
    }
  });
});

describe('STATUS_LABELS', () => {
  it('covers all schedule statuses', () => {
    const statuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    for (const st of statuses) {
      expect(STATUS_LABELS).toHaveProperty(st);
    }
  });
});
