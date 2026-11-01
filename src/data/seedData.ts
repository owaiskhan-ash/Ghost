import type {
  SavedContact,
  ScheduledWhatsAppTask,
  SentHistoryItem,
} from '../types/ghost';

export function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

export function getTodayOrTomorrowDate(time24: string): string {
  const now = new Date();
  const [hStr, mStr] = time24.split(':');
  const target = new Date(now);
  target.setHours(Number(hStr) || 0, Number(mStr) || 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

export const INITIAL_CONTACTS: SavedContact[] = [
  {
    id: 'c-jasmine',
    name: 'Jasmine',
    phone: '+919820448210',
    initials: 'JA',
    isFavourite: true,
  },
  {
    id: 'c-mom',
    name: 'Mom',
    phone: '+919820112233',
    initials: 'MO',
  },
  {
    id: 'c-rohan',
    name: 'Rohan',
    phone: '+919769044110',
    initials: 'RO',
  },
];

const defaultDate = getTodayOrTomorrowDate('05:00');

export const INITIAL_TASKS: ScheduledWhatsAppTask[] = [
  {
    id: 'task-jasmine-5am',
    contactId: 'c-jasmine',
    contactName: 'Jasmine',
    contactPhone: '+919820448210',
    contactInitials: 'JA',
    messageBody: 'Good morning',
    scheduledTime24: '05:00',
    scheduledDate: defaultDate,
    triggerAtMillis: computeTriggerMillis(defaultDate, '05:00'),
    repeatMode: 'daily',
    whatsappPackage: 'com.whatsapp',
    enabled: true,
  },
];

export const INITIAL_HISTORY: SentHistoryItem[] = [
  {
    id: 'hist-1',
    taskId: 'task-jasmine-5am',
    contactName: 'Jasmine',
    contactPhone: '+919820448210',
    messageBody: 'Good morning',
    sentAt: '05:00 AM',
    status: 'SENT',
  },
];
