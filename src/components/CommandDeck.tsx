import React, { useMemo, useState } from 'react';
import {
  BookUser,
  Calendar,
  Check,
  Clock,
  Play,
  Plus,
  Repeat,
  Send,
} from 'lucide-react';
import type {
  RepeatMode,
  SavedContact,
  ScheduledWhatsAppTask,
  TargetWhatsApp,
} from '../types/ghost';
import {
  computeTriggerMillis,
  formatTime12h,
  getTodayOrTomorrowDate,
  makeInitials,
} from '../data/seedData';
import {
  isRunningInNativeApk,
  launchNativeContactPicker,
} from '../bridge/nativeBridge';

interface CommandDeckProps {
  contacts: SavedContact[];
  onAddContact: (c: SavedContact) => void;
  onScheduleTask: (task: ScheduledWhatsAppTask) => void;
  onPreviewOrSendNow: (task: ScheduledWhatsAppTask) => void;
}

function addMinutesFromNow(mins: number): { date: string; time24: string } {
  const dt = new Date(Date.now() + mins * 60 * 1000);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return { date: `${yyyy}-${mo}-${dd}`, time24: `${hh}:${mm}` };
}

export const CommandDeck: React.FC<CommandDeckProps> = ({
  contacts,
  onAddContact,
  onScheduleTask,
  onPreviewOrSendNow,
}) => {
  const nativeMode = isRunningInNativeApk();

  const [selectedContactId, setSelectedContactId] = useState<string>(
    contacts[0]?.id || ''
  );
  const [messageBody, setMessageBody] = useState('Good morning');
  const [time24, setTime24] = useState('05:00');
  const [dateStr, setDateStr] = useState(() => getTodayOrTomorrowDate('05:00'));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once');
  const [whatsappPackage, setWhatsappPackage] =
    useState<TargetWhatsApp>('com.whatsapp');
  const [scheduledToast, setScheduledToast] = useState(false);

  // Add new contact inline
  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+91');

  const activeContact: SavedContact = useMemo(() => {
    return (
      contacts.find((c) => c.id === selectedContactId) ||
      contacts[0] || {
        id: 'c-fallback',
        name: 'Jasmine',
        phone: '+919820448210',
        initials: 'JA',
      }
    );
  }, [contacts, selectedContactId]);

  // Derived 12-hour parts for crisp hour / minute / AM-PM controls
  const parsedTime = useMemo(() => {
    const [hStr, mStr] = time24.split(':');
    const h24 = Number(hStr) || 0;
    const min = Number(mStr) || 0;
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { h24, h12, min, period };
  }, [time24]);

  const updateTimeParts = (h12: number, min: number, period: 'AM' | 'PM') => {
    let h24 = h12 % 12;
    if (period === 'PM') h24 += 12;
    const nextTime = `${String(h24).padStart(2, '0')}:${String(min).padStart(
      2,
      '0'
    )}`;
    setTime24(nextTime);
    setDateStr(getTodayOrTomorrowDate(nextTime));
  };

  const applyQuickTime = (preset: '1m' | '5m' | '5am' | '9am') => {
    if (preset === '1m') {
      const next = addMinutesFromNow(1);
      setTime24(next.time24);
      setDateStr(next.date);
    } else if (preset === '5m') {
      const next = addMinutesFromNow(5);
      setTime24(next.time24);
      setDateStr(next.date);
    } else if (preset === '5am') {
      setTime24('05:00');
      setDateStr(getTodayOrTomorrowDate('05:00'));
    } else if (preset === '9am') {
      setTime24('09:00');
      setDateStr(getTodayOrTomorrowDate('09:00'));
    }
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    const cleanPhone = newPhone.replace(/[^\d+]/g, '');
    if (!cleanPhone) return;
    const created: SavedContact = {
      id: `c-${Date.now()}`,
      name: newName.trim(),
      phone: cleanPhone,
      initials: makeInitials(newName),
    };
    onAddContact(created);
    setSelectedContactId(created.id);
    setNewName('');
    setNewPhone('+91');
    setShowAddContact(false);
  };

  const handlePickNativeContact = () => {
    const ok = launchNativeContactPicker((picked) => {
      onAddContact(picked);
      setSelectedContactId(picked.id);
    });
    if (!ok) {
      setShowAddContact(true);
    }
  };

  const buildTask = (): ScheduledWhatsAppTask => ({
    id: `task-${Date.now()}`,
    contactId: activeContact.id,
    contactName: activeContact.name,
    contactPhone: activeContact.phone,
    contactInitials: activeContact.initials,
    messageBody: messageBody.trim() || 'Good morning',
    scheduledTime24: time24,
    scheduledDate: dateStr,
    triggerAtMillis: computeTriggerMillis(dateStr, time24),
    repeatMode,
    whatsappPackage,
    enabled: true,
  });

  const handleSchedule = () => {
    onScheduleTask(buildTask());
    setScheduledToast(true);
    setTimeout(() => setScheduledToast(false), 2200);
  };

  return (
    <div className="space-y-3.5 pb-4">
      {/* 1. SELECT CONTACT */}
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ghost-secondary">
            Contact
          </span>
          <div className="flex items-center gap-2">
            {nativeMode && (
              <button
                type="button"
                onClick={handlePickNativeContact}
                className="px-2.5 py-1 rounded-full bg-ghost-redSoft text-ghost-red text-xs font-semibold flex items-center gap-1"
              >
                <BookUser className="w-3.5 h-3.5" /> Phonebook
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddContact((v) => !v)}
              className="text-xs font-semibold text-ghost-red flex items-center gap-0.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {showAddContact && (
          <form
            onSubmit={handleSaveContact}
            className="p-2.5 rounded-2xl bg-ghost-recessed flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              placeholder="Name (e.g. Jasmine)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-xl bg-white px-3 py-2 text-xs text-ghost-ink focus:outline-none"
            />
            <input
              type="tel"
              placeholder="+919820448210"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-mono text-ghost-ink focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-ghost-red text-white text-xs font-bold shrink-0"
            >
              Save
            </button>
          </form>
        )}

        <div className="flex flex-wrap gap-2">
          {contacts.map((c) => {
            const selected = c.id === activeContact.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedContactId(c.id)}
                className={`px-3 py-2 rounded-2xl text-xs font-semibold transition flex items-center gap-2 border ${
                  selected
                    ? 'bg-ghost-red text-white border-ghost-red shadow-neonSm'
                    : 'bg-white text-ghost-ink border-ghost-border hover:border-ghost-borderStrong'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    selected
                      ? 'bg-white/20 text-white'
                      : 'bg-ghost-recessed text-ghost-ink'
                  }`}
                >
                  {c.initials}
                </span>
                <div className="text-left">
                  <div className="leading-tight">{c.name}</div>
                  <div
                    className={`text-[10px] font-mono leading-tight ${
                      selected ? 'text-white/80' : 'text-ghost-muted'
                    }`}
                  >
                    {c.phone}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. PICK ANY TIME & DATE */}
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ghost-secondary flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ghost-red" /> Time
          </span>

          {/* Quick Time Shortcuts */}
          <div className="flex items-center gap-1">
            {(
              [
                { id: '1m', label: '+1m' },
                { id: '5m', label: '+5m' },
                { id: '5am', label: '5 AM' },
                { id: '9am', label: '9 AM' },
              ] as const
            ).map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => applyQuickTime(q.id)}
                className="px-2 py-0.5 rounded-full bg-ghost-recessed hover:bg-ghost-redSoft hover:text-ghost-red text-[11px] font-medium text-ghost-secondary transition"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Exact Hour : Minute + AM/PM Selector */}
        <div className="rounded-2xl bg-white border border-ghost-border p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* Hour 1..12 */}
            <select
              aria-label="Hour"
              value={parsedTime.h12}
              onChange={(e) =>
                updateTimeParts(
                  Number(e.target.value),
                  parsedTime.min,
                  parsedTime.period
                )
              }
              className="appearance-none bg-ghost-canvas rounded-xl px-3 py-2 font-mono text-xl font-bold text-ghost-ink text-center focus:outline-none focus:ring-2 focus:ring-ghost-red cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </select>

            <span className="font-mono text-xl font-bold text-ghost-muted">
              :
            </span>

            {/* Minute 00..59 */}
            <select
              aria-label="Minute"
              value={parsedTime.min}
              onChange={(e) =>
                updateTimeParts(
                  parsedTime.h12,
                  Number(e.target.value),
                  parsedTime.period
                )
              }
              className="appearance-none bg-ghost-canvas rounded-xl px-3 py-2 font-mono text-xl font-bold text-ghost-ink text-center focus:outline-none focus:ring-2 focus:ring-ghost-red cursor-pointer"
            >
              {Array.from({ length: 60 }, (_, m) => m).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>

          {/* AM / PM Switch */}
          <div className="flex bg-ghost-recessed p-1 rounded-xl">
            {(['AM', 'PM'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  updateTimeParts(parsedTime.h12, parsedTime.min, p)
                }
                className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition ${
                  parsedTime.period === p
                    ? 'bg-ghost-red text-white shadow-neonSm'
                    : 'text-ghost-secondary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Repeat Row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white border border-ghost-border px-3 py-2 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-ghost-red shrink-0" />
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              disabled={repeatMode === 'daily'}
              className="w-full bg-transparent text-xs font-medium text-ghost-ink focus:outline-none disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setRepeatMode((m) => (m === 'once' ? 'daily' : 'once'))
            }
            className={`rounded-2xl px-3 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
              repeatMode === 'daily'
                ? 'bg-ghost-redSoft text-ghost-red border-ghost-red/40'
                : 'bg-white text-ghost-secondary border-ghost-border'
            }`}
          >
            <Repeat className="w-3.5 h-3.5 text-ghost-red" />
            {repeatMode === 'daily' ? 'Every Day' : 'One Time'}
          </button>
        </div>
      </section>

      {/* 3. MESSAGE */}
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ghost-secondary">
            Message
          </span>

          <div className="flex bg-ghost-recessed p-0.5 rounded-full text-[11px]">
            <button
              type="button"
              onClick={() => setWhatsappPackage('com.whatsapp')}
              className={`px-2.5 py-0.5 rounded-full font-medium transition ${
                whatsappPackage === 'com.whatsapp'
                  ? 'bg-white text-ghost-ink shadow-sm'
                  : 'text-ghost-secondary'
              }`}
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setWhatsappPackage('com.whatsapp.w4b')}
              className={`px-2.5 py-0.5 rounded-full font-medium transition ${
                whatsappPackage === 'com.whatsapp.w4b'
                  ? 'bg-white text-ghost-ink shadow-sm'
                  : 'text-ghost-secondary'
              }`}
            >
              WA Business
            </button>
          </div>
        </div>

        <textarea
          rows={2}
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          placeholder="Write your WhatsApp message…"
          className="w-full rounded-2xl bg-white border border-ghost-border focus:border-ghost-red focus:outline-none px-3.5 py-2.5 text-sm font-medium text-ghost-ink placeholder:text-ghost-muted resize-none"
        />

        {/* Action Buttons */}
        <div className="grid grid-cols-5 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onPreviewOrSendNow(buildTask())}
            className="col-span-2 py-3 rounded-2xl bg-ghost-recessed hover:bg-ghost-border text-ghost-ink font-semibold text-xs transition flex items-center justify-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 text-ghost-red fill-current" />
            {nativeMode ? 'Send Now' : 'Test'}
          </button>

          <button
            type="button"
            onClick={handleSchedule}
            className="col-span-3 py-3 rounded-2xl bg-ghost-red hover:bg-ghost-redHover text-white font-bold text-xs shadow-neon transition flex items-center justify-center gap-1.5"
          >
            {scheduledToast ? (
              <>
                <Check className="w-4 h-4" />
                Scheduled
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Schedule · {formatTime12h(time24)}
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};
