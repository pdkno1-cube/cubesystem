'use client';

import { useRef } from 'react';
import { clsx } from 'clsx';
import {
  type ScheduleItem,
  type ScheduleChannel,
  CHANNEL_COLORS,
  groupByDate,
} from '@/stores/marketingStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  schedules: ScheduleItem[];
  selectedDate: string | null;
  onDayClick: (dateStr: string) => void;
  onItemClick: (item: ScheduleItem) => void;
  onItemDrop: (scheduleId: string, newDate: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];

  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  const trailing = (7 - (days.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) days.push(null);

  return days;
}

function toDateStr(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return (
    now.getFullYear() === year &&
    now.getMonth() === month &&
    now.getDate() === day
  );
}

// ---------------------------------------------------------------------------
// DraggableScheduleBadge
// ---------------------------------------------------------------------------

function ScheduleBadge({
  item,
  onClick,
}: {
  item: ScheduleItem;
  onClick: (item: ScheduleItem) => void;
}) {
  const colors = CHANNEL_COLORS[item.channel as ScheduleChannel] ??
    CHANNEL_COLORS.blog;

  const isCompleted = item.status === 'completed';
  const isFailed = item.status === 'failed';

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(item);
      }}
      title={item.title}
      className={clsx(
        'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-xs font-medium',
        'cursor-grab active:cursor-grabbing transition-opacity',
        colors.bg,
        colors.text,
        isCompleted && 'opacity-60',
        isFailed && 'ring-1 ring-red-400',
      )}
    >
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', colors.dot)} />
      <span className="truncate">{item.title}</span>
      {isFailed && <span className="ml-auto shrink-0 text-red-500">!</span>}
      {isCompleted && <span className="ml-auto shrink-0">✓</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CalendarCell
// ---------------------------------------------------------------------------

function CalendarCell({
  day,
  year,
  month,
  items,
  isSelected,
  isToday: todayFlag,
  onDayClick,
  onItemClick,
  onItemDrop,
}: {
  day: number | null;
  year: number;
  month: number;
  items: ScheduleItem[];
  isSelected: boolean;
  isToday: boolean;
  onDayClick: (dateStr: string) => void;
  onItemClick: (item: ScheduleItem) => void;
  onItemDrop: (scheduleId: string, newDate: string) => void;
}) {
  const dragOverRef = useRef(false);

  if (day === null) {
    return <div className="min-h-[90px] bg-gray-50/50 rounded-lg border border-gray-100" />;
  }

  const dateStr = toDateStr(year, month, day);
  const MAX_VISIBLE = 3;
  const visible = items.slice(0, MAX_VISIBLE);
  const overflow = items.length - MAX_VISIBLE;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onDayClick(dateStr)}
      onKeyDown={(e) => { if (e.key === 'Enter') onDayClick(dateStr); }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragOverRef.current = true;
      }}
      onDragLeave={() => { dragOverRef.current = false; }}
      onDrop={(e) => {
        e.preventDefault();
        const scheduleId = e.dataTransfer.getData('text/plain');
        if (scheduleId) onItemDrop(scheduleId, dateStr);
        dragOverRef.current = false;
      }}
      className={clsx(
        'min-h-[90px] rounded-lg border p-1.5 cursor-pointer transition-colors',
        'flex flex-col gap-0.5 select-none',
        isSelected
          ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-300'
          : 'border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/30',
      )}
    >
      {/* Day number */}
      <span
        className={clsx(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
          todayFlag
            ? 'bg-violet-600 text-white'
            : 'text-gray-700',
        )}
      >
        {day}
      </span>

      {/* Schedule badges */}
      <div className="flex flex-col gap-0.5 mt-0.5">
        {visible.map((item) => (
          <ScheduleBadge key={item.id} item={item} onClick={onItemClick} />
        ))}
        {overflow > 0 && (
          <span className="px-1 text-xs text-gray-400">+{overflow}개 더</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalendarGrid (main export)
// ---------------------------------------------------------------------------

export function CalendarGrid({
  year,
  month,
  schedules,
  selectedDate,
  onDayClick,
  onItemClick,
  onItemDrop,
}: CalendarGridProps) {
  const days = buildCalendarDays(year, month);
  const grouped = groupByDate(schedules);

  return (
    <div className="flex flex-col gap-1">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAYS_OF_WEEK.map((d, i) => (
          <div
            key={d}
            className={clsx(
              'py-1.5 text-center text-xs font-semibold',
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          const dateStr = day ? toDateStr(year, month, day) : '';
          const items = day ? (grouped[dateStr] ?? []) : [];
          return (
            <CalendarCell
              key={idx}
              day={day}
              year={year}
              month={month}
              items={items}
              isSelected={day !== null && selectedDate === dateStr}
              isToday={day !== null && isToday(year, month, day)}
              onDayClick={onDayClick}
              onItemClick={onItemClick}
              onItemDrop={onItemDrop}
            />
          );
        })}
      </div>
    </div>
  );
}
