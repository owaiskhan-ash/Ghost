import type {
  ContactGroup,
  QuickTemplate,
  RepeatMode,
  SavedContact,
  ScheduledWhatsAppTask,
  SentHistoryItem,
} from '../types/ghost';

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatDateYmd(dt: Date): string {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getTodayOrTomorrowDate(time24: string): string {
  const now = new Date();
  const [hStr, mStr] = time24.split(':');
  const target = new Date(now);
  target.setHours(Number(hStr) || 0, Number(mStr) || 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return formatDateYmd(target);
}

export function computeTriggerMillis(dateStr: string, time24: string): number {
  const [yyyy, mm, dd] = dateStr.split('-').map(Number);
  const [hh, min] = time24.split(':').map(Number);
  const dt = new Date(
    yyyy || new Date().getFullYear(),
    (mm || 1) - 1,
    dd || 1,
    hh || 0,
    min || 0,
    0,
    0
  );
  if (dt.getTime() <= Date.now()) {
    dt.setDate(dt.getDate() + 1);
  }
  return dt.getTime();
}

export function computeNextTaskTrigger(opts: {
  scheduledDate: string;
  scheduledTime24: string;
  repeatMode: RepeatMode;
  repeatDays?: number[];
  repeatMonthDay?: number;
  repeatIntervalDays?: number;
}): { triggerAtMillis: number; nextDateStr: string } {
  const nowBuffer = Date.now() + 2000;
  const [hh, min] = opts.scheduledTime24.split(':').map((n) => Number(n) || 0);

  if (opts.repeatMode === 'daily') {
    const dt = new Date();
    dt.setHours(hh, min, 0, 0);
    if (dt.getTime() <= nowBuffer) {
      dt.setDate(dt.getDate() + 1);
    }
    return { triggerAtMillis: dt.getTime(), nextDateStr: formatDateYmd(dt) };
  }

  if (opts.repeatMode === 'weekly') {
    const allowed = new Set(
      opts.repeatDays && opts.repeatDays.length > 0
        ? opts.repeatDays
        : [new Date().getDay()]
    );
    const probe = new Date();
    probe.setHours(hh, min, 0, 0);
    for (let offset = 0; offset <= 8; offset++) {
      if (allowed.has(probe.getDay()) && probe.getTime() > nowBuffer) {
        return {
          triggerAtMillis: probe.getTime(),
          nextDateStr: formatDateYmd(probe),
        };
      }
      probe.setDate(probe.getDate() + 1);
    }
    return {
      triggerAtMillis: probe.getTime(),
      nextDateStr: formatDateYmd(probe),
    };
  }

  if (opts.repeatMode === 'monthly') {
    const desiredDay = Math.min(
      31,
      Math.max(1, opts.repeatMonthDay || new Date().getDate())
    );
    const now = new Date();
    for (let mOffset = 0; mOffset <= 14; mOffset++) {
      const targetYear = now.getFullYear();
      const targetMonth = now.getMonth() + mOffset;
      const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const clampedDay = Math.min(desiredDay, daysInMonth);
      const candidate = new Date(
        targetYear,
        targetMonth,
        clampedDay,
        hh,
        min,
        0,
        0
      );
      if (candidate.getTime() > nowBuffer) {
        return {
          triggerAtMillis: candidate.getTime(),
          nextDateStr: formatDateYmd(candidate),
        };
      }
    }
  }

  if (opts.repeatMode === 'interval') {
    const stepDays = Math.max(1, opts.repeatIntervalDays || 2);
    const [yyyy, mm, dd] = opts.scheduledDate.split('-').map(Number);
    const anchor = new Date(
      yyyy || new Date().getFullYear(),
      (mm || 1) - 1,
      dd || 1,
      hh,
      min,
      0,
      0
    );
    while (anchor.getTime() <= nowBuffer) {
      anchor.setDate(anchor.getDate() + stepDays);
    }
    return {
      triggerAtMillis: anchor.getTime(),
      nextDateStr: formatDateYmd(anchor),
    };
  }

  // 'once'
  const triggerAtMillis = computeTriggerMillis(
    opts.scheduledDate,
    opts.scheduledTime24
  );
  return {
    triggerAtMillis,
    nextDateStr: formatDateYmd(new Date(triggerAtMillis)),
  };
}

export function formatRepeatSummary(task: {
  repeatMode: RepeatMode;
  scheduledDate: string;
  repeatDays?: number[];
  repeatMonthDay?: number;
  repeatIntervalDays?: number;
}): string {
  switch (task.repeatMode) {
    case 'daily':
      return 'Daily';
    case 'weekly': {
      const days =
        task.repeatDays && task.repeatDays.length > 0
          ? [...task.repeatDays].sort((a, b) => a - b)
          : [];
      if (days.length === 7) return 'Daily';
      if (days.length === 0) return 'Weekly';
      return days.map((d) => SHORT_WEEKDAYS[d] ?? '').join(', ');
    }
    case 'monthly':
      return `Monthly · Day ${task.repeatMonthDay || 1}`;
    case 'interval':
      return `Every ${task.repeatIntervalDays || 2}d`;
    case 'once':
    default:
      return task.scheduledDate;
  }
}

export function hasDynamicVariables(text: string): boolean {
  return /\{\s*(name|first_name|date|day)\s*\}/i.test(text);
}

export function resolveMessageVariables(
  template: string,
  contactName: string,
  refDate: Date = new Date()
): string {
  if (!template) return '';
  const safeName = contactName?.trim() || 'Friend';
  const firstName = safeName.split(/\s+/)[0] || safeName;
  const dd = String(refDate.getDate()).padStart(2, '0');
  const mon = SHORT_MONTHS[refDate.getMonth()];
  const yyyy = refDate.getFullYear();
  const dateStr = `${dd} ${mon} ${yyyy}`;
  const dayStr = FULL_WEEKDAYS[refDate.getDay()];

  return template
    .replace(/\{\s*name\s*\}/gi, safeName)
    .replace(/\{\s*first_name\s*\}/gi, firstName)
    .replace(/\{\s*date\s*\}/gi, dateStr)
    .replace(/\{\s*day\s*\}/gi, dayStr);
}

export function makeInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'WA'
  );
}

// Zero dummy data — all state starts empty and persists in phone cache
export const EMPTY_CONTACTS: SavedContact[] = [];
export const EMPTY_GROUPS: ContactGroup[] = [];
export const EMPTY_TEMPLATES: QuickTemplate[] = [];
export const EMPTY_TASKS: ScheduledWhatsAppTask[] = [];
export const EMPTY_HISTORY: SentHistoryItem[] = [];
