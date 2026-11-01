import React, { useMemo, useRef, useState } from 'react';
import {
  BookUser,
  Calendar,
  Check,
  Clock,
  Pencil,
  Play,
  Plus,
  Repeat,
  Send,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  BatchRecipient,
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
  onToggleFavouriteContact: (id: string) => void;
  onEditContact: (id: string, name: string, phone: string) => void;
  onDeleteContact: (id: string) => void;
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

const LONG_PRESS_MS = 420;

export const CommandDeck: React.FC<CommandDeckProps> = ({
  contacts,
  onAddContact,
  onToggleFavouriteContact,
  onEditContact,
  onDeleteContact,
  onScheduleTask,
  onPreviewOrSendNow,
}) => {
  const nativeMode = isRunningInNativeApk();

  const sortedContacts = useMemo(() => {
    const favs = contacts.filter((c) => c.isFavourite);
    const others = contacts.filter((c) => !c.isFavourite);
    return [...favs, ...others];
  }, [contacts]);

  const [multiMode, setMultiMode] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>(
    sortedContacts[0]?.id || ''
  );
  const [selectedMultiIds, setSelectedMultiIds] = useState<string[]>(() =>
    sortedContacts.slice(0, 2).map((c) => c.id)
  );

  const [messageMode, setMessageMode] = useState<'same' | 'custom'>('custom');
  const [messageBody, setMessageBody] = useState('Good morning');
  const [customMessages, setCustomMessages] = useState<Record<string, string>>(
    {}
  );

  const [time24, setTime24] = useState('05:00');
  const [dateStr, setDateStr] = useState(() => getTodayOrTomorrowDate('05:00'));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once');
  const [whatsappPackage, setWhatsappPackage] =
    useState<TargetWhatsApp>('com.whatsapp');
  const [scheduledToast, setScheduledToast] = useState(false);

  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+91');

  const [pressingContactId, setPressingContactId] = useState<string | null>(
    null
  );
  const [menuContactId, setMenuContactId] = useState<string | null>(null);
  const [editingInSheet, setEditingInSheet] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef(false);

  const menuContact = useMemo(
    () => contacts.find((c) => c.id === menuContactId) || null,
    [contacts, menuContactId]
  );

  const activeSingleContact: SavedContact | null = useMemo(() => {
    if (sortedContacts.length === 0) return null;
    return (
      sortedContacts.find((c) => c.id === selectedContactId) ||
      sortedContacts[0]
    );
  }, [sortedContacts, selectedContactId]);

  const activeMultiContacts: SavedContact[] = useMemo(() => {
    const valid = selectedMultiIds
      .map((id) => contacts.find((c) => c.id === id))
      .filter((c): c is SavedContact => Boolean(c));
    if (valid.length > 0) return valid;
    return sortedContacts[0] ? [sortedContacts[0]] : [];
  }, [selectedMultiIds, contacts, sortedContacts]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressingContactId(null);
    pointerStartRef.current = null;
  };

  const openContactMenu = (contact: SavedContact) => {
    clearLongPressTimer();
    try {
      navigator.vibrate?.(16);
    } catch {}
    setMenuContactId(contact.id);
    setEditName(contact.name);
    setEditPhone(contact.phone);
    setEditingInSheet(false);
  };

  const closeContactMenu = () => {
    setMenuContactId(null);
    setEditingInSheet(false);
  };

  const handlePointerDownContact = (
    contact: SavedContact,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    didLongPressRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    setPressingContactId(contact.id);

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      openContactMenu(contact);
    }, LONG_PRESS_MS);
  };

  const handlePointerMoveContact = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerStartRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    if (dx > 10 || dy > 10) {
      clearLongPressTimer();
    }
  };

  const handleTapContact = (c: SavedContact) => {
    if (!multiMode) {
      setSelectedContactId(c.id);
      return;
    }
    setSelectedMultiIds((prev) => {
      const exists = prev.includes(c.id);
      if (exists) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== c.id);
      }
      return [...prev, c.id];
    });
  };

  const toggleMultiMode = () => {
    setMultiMode((prev) => {
      const next = !prev;
      if (next) {
        setSelectedMultiIds((curr) => {
          const valid = curr.filter((id) => contacts.some((c) => c.id === id));
          if (valid.length >= 2) return valid;
          const seed: string[] = [];
          if (activeSingleContact) seed.push(activeSingleContact.id);
          for (const item of sortedContacts) {
            if (!seed.includes(item.id) && seed.length < 2) {
              seed.push(item.id);
            }
          }
          return seed;
        });
      }
      return next;
    });
  };

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
    if (multiMode) {
      setSelectedMultiIds((prev) => [...prev, created.id]);
    }
    setNewName('');
    setNewPhone('+91');
    setShowAddContact(false);
  };

  const handleSaveEditedContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuContact || !editName.trim() || !editPhone.trim()) return;
    const cleanPhone = editPhone.replace(/[^\d+]/g, '');
    if (!cleanPhone) return;
    onEditContact(menuContact.id, editName.trim(), cleanPhone);
    closeContactMenu();
  };

  const handlePickNativeContact = () => {
    const ok = launchNativeContactPicker((picked) => {
      onAddContact(picked);
      setSelectedContactId(picked.id);
      if (multiMode) {
        setSelectedMultiIds((prev) =>
          prev.includes(picked.id) ? prev : [...prev, picked.id]
        );
      }
    });
    if (!ok) {
      setShowAddContact(true);
    }
  };

  const buildTask = (): ScheduledWhatsAppTask | null => {
    if (!multiMode || activeMultiContacts.length <= 1) {
      const target = multiMode ? activeMultiContacts[0] : activeSingleContact;
      if (!target) {
        setShowAddContact(true);
        return null;
      }
      return {
        id: `task-${Date.now()}`,
        contactId: target.id,
        contactName: target.name,
        contactPhone: target.phone,
        contactInitials: target.initials,
        messageBody: messageBody.trim() || 'Good morning',
        scheduledTime24: time24,
        scheduledDate: dateStr,
        triggerAtMillis: computeTriggerMillis(dateStr, time24),
        repeatMode,
        whatsappPackage,
        enabled: true,
      };
    }

    const recipients: BatchRecipient[] = activeMultiContacts.map((c) => {
      const msg =
        messageMode === 'custom'
          ? (customMessages[c.id] ?? '').trim() ||
            messageBody.trim() ||
            `Hi ${c.name}`
          : messageBody.trim() || 'Good morning';
      return {
        contactId: c.id,
        contactName: c.name,
        contactPhone: c.phone,
        contactInitials: c.initials,
        messageBody: msg,
      };
    });

    const first = recipients[0];
    const summaryLabel =
      recipients.length === 2
        ? `${recipients[0].contactName} & ${recipients[1].contactName}`
        : `${recipients[0].contactName}, ${recipients[1].contactName} +${
            recipients.length - 2
          }`;

    return {
      id: `task-${Date.now()}`,
      contactId: first.contactId,
      contactName: summaryLabel,
      contactPhone: first.contactPhone,
      contactInitials: `${recipients.length}x`,
      messageBody:
        messageMode === 'same'
          ? first.messageBody
          : `${recipients.length} custom messages`,
      recipients,
      scheduledTime24: time24,
      scheduledDate: dateStr,
      triggerAtMillis: computeTriggerMillis(dateStr, time24),
      repeatMode,
      whatsappPackage,
      enabled: true,
    };
  };

  const handleSchedule = () => {
    const task = buildTask();
    if (!task) return;
    onScheduleTask(task);
    setScheduledToast(true);
    setTimeout(() => setScheduledToast(false), 2200);
  };

  const handlePreview = () => {
    const task = buildTask();
    if (!task) return;
    onPreviewOrSendNow(task);
  };

  const isMultiBatch = multiMode && activeMultiContacts.length > 1;

  return (
    <div className="space-y-3 pb-4">
      {/* 1. CONTACTS — Boxy Card with Outlined & Solid Buttons */}
      <section className="box-card p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
              {multiMode ? `Contacts [${activeMultiContacts.length}]` : 'Contact'}
            </span>
            {sortedContacts.length > 0 && (
              <span className="text-[10px] font-mono text-ghost-muted truncate">
                · HOLD FOR MENU
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {sortedContacts.length > 1 && (
              <button
                type="button"
                onClick={toggleMultiMode}
                className={
                  multiMode
                    ? 'btn-solid px-2.5 py-1 text-[10px]'
                    : 'btn-outline px-2.5 py-1 text-[10px]'
                }
              >
                <Users className="w-3 h-3" />
                Multi
              </button>
            )}

            {nativeMode && (
              <button
                type="button"
                onClick={handlePickNativeContact}
                className="btn-outline-red px-2.5 py-1 text-[10px]"
              >
                <BookUser className="w-3 h-3" />
                Book
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAddContact((v) => !v)}
              className={
                showAddContact
                  ? 'btn-solid px-2.5 py-1 text-[10px]'
                  : 'btn-outline-red px-2.5 py-1 text-[10px]'
              }
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
        </div>

        {(showAddContact || sortedContacts.length === 0) && (
          <form
            onSubmit={handleSaveContact}
            className="p-2.5 bg-ghost-recessed border-[1.5px] border-ghost-border rounded-[2px] flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              placeholder="Name (e.g. Jasmine)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="box-input flex-1 px-2.5 py-2 text-xs"
            />
            <input
              type="tel"
              placeholder="+919820448210"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="box-input flex-1 px-2.5 py-2 text-xs font-mono"
            />
            <button type="submit" className="btn-solid px-4 py-2 shrink-0">
              Save
            </button>
          </form>
        )}

        {sortedContacts.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {sortedContacts.map((c) => {
              const multiOrderIdx = activeMultiContacts.findIndex(
                (mc) => mc.id === c.id
              );
              const selected = multiMode
                ? multiOrderIdx !== -1
                : activeSingleContact?.id === c.id;
              const isPressing = pressingContactId === c.id;

              return (
                <button
                  key={c.id}
                  type="button"
                  onPointerDown={(e) => handlePointerDownContact(c, e)}
                  onPointerMove={handlePointerMoveContact}
                  onPointerUp={clearLongPressTimer}
                  onPointerLeave={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    didLongPressRef.current = true;
                    openContactMenu(c);
                  }}
                  onClick={(e) => {
                    if (didLongPressRef.current) {
                      didLongPressRef.current = false;
                      e.preventDefault();
                      return;
                    }
                    handleTapContact(c);
                  }}
                  className={`no-touch-callout touch-manipulation px-2.5 py-2 rounded-[2px] text-xs font-semibold transition flex items-center gap-2 border-[1.5px] text-left ${
                    isPressing ? 'scale-[0.98] ring-2 ring-ghost-red' : ''
                  } ${
                    selected
                      ? 'bg-ghost-red text-white border-ghost-red shadow-neonSm'
                      : 'bg-ghost-elevated text-ghost-ink border-ghost-borderStrong hover:border-ghost-red'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-[2px] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border ${
                      selected
                        ? 'bg-black/25 text-white border-white/30'
                        : 'bg-ghost-recessed text-ghost-ink border-ghost-border'
                    }`}
                  >
                    {multiMode && selected ? multiOrderIdx + 1 : c.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="leading-tight flex items-center gap-1 truncate">
                      <span className="truncate font-bold">{c.name}</span>
                      {c.isFavourite && (
                        <Star
                          className={`w-3 h-3 fill-current shrink-0 ${
                            selected ? 'text-white' : 'text-ghost-red'
                          }`}
                        />
                      )}
                    </div>
                    <div
                      className={`text-[10px] font-mono leading-tight truncate mt-0.5 ${
                        selected ? 'text-white/85' : 'text-ghost-muted'
                      }`}
                    >
                      {c.phone}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. TIME & SCHEDULE */}
      <section className="box-card p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ghost-red" /> Time
          </span>

          <div className="flex items-center gap-1">
            {(
              [
                { id: '1m', label: '+1M' },
                { id: '5m', label: '+5M' },
                { id: '5am', label: '5 AM' },
                { id: '9am', label: '9 AM' },
              ] as const
            ).map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => applyQuickTime(q.id)}
                className="btn-outline px-2 py-0.5 text-[10px] font-mono"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-ghost-elevated border-[1.5px] border-ghost-border rounded-[2px] p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
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
              className="appearance-none bg-ghost-canvas border-[1.5px] border-ghost-borderStrong focus:border-ghost-red rounded-[2px] px-3 py-1.5 font-mono text-xl font-bold text-ghost-ink text-center focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </select>

            <span className="font-mono text-xl font-bold text-ghost-red">
              :
            </span>

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
              className="appearance-none bg-ghost-canvas border-[1.5px] border-ghost-borderStrong focus:border-ghost-red rounded-[2px] px-3 py-1.5 font-mono text-xl font-bold text-ghost-ink text-center focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 60 }, (_, m) => m).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            {(['AM', 'PM'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  updateTimeParts(parsedTime.h12, parsedTime.min, p)
                }
                className={
                  parsedTime.period === p
                    ? 'btn-solid px-3 py-2 font-mono text-xs'
                    : 'btn-outline px-3 py-2 font-mono text-xs'
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="box-input px-2.5 py-2 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-ghost-red shrink-0" />
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              disabled={repeatMode === 'daily'}
              className="w-full bg-transparent text-xs font-mono font-medium text-ghost-ink focus:outline-none disabled:opacity-40"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setRepeatMode((m) => (m === 'once' ? 'daily' : 'once'))
            }
            className={
              repeatMode === 'daily'
                ? 'btn-solid px-3 py-2'
                : 'btn-outline px-3 py-2'
            }
          >
            <Repeat className="w-3.5 h-3.5" />
            {repeatMode === 'daily' ? 'Every Day' : 'One Time'}
          </button>
        </div>
      </section>

      {/* 3. APP TARGET (WhatsApp vs WA Business) & MESSAGE */}
      <section className="box-card p-3.5 space-y-3">
        {/* Strict App Selector: WhatsApp (com.whatsapp) vs WA Business (com.whatsapp.w4b) */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary block">
            Open App
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWhatsappPackage('com.whatsapp')}
              className={
                whatsappPackage === 'com.whatsapp'
                  ? 'btn-solid py-2'
                  : 'btn-outline py-2'
              }
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setWhatsappPackage('com.whatsapp.w4b')}
              className={
                whatsappPackage === 'com.whatsapp.w4b'
                  ? 'btn-solid py-2'
                  : 'btn-outline py-2'
              }
            >
              WA Business
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
            Message
          </span>

          {isMultiBatch && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMessageMode('custom')}
                className={
                  messageMode === 'custom'
                    ? 'btn-solid px-2.5 py-1 text-[10px]'
                    : 'btn-outline px-2.5 py-1 text-[10px]'
                }
              >
                Per Person
              </button>
              <button
                type="button"
                onClick={() => setMessageMode('same')}
                className={
                  messageMode === 'same'
                    ? 'btn-solid px-2.5 py-1 text-[10px]'
                    : 'btn-outline px-2.5 py-1 text-[10px]'
                }
              >
                Same
              </button>
            </div>
          )}
        </div>

        {isMultiBatch && messageMode === 'custom' ? (
          <div className="space-y-2">
            {activeMultiContacts.map((c, idx) => (
              <div
                key={c.id}
                className="box-input px-2.5 py-2 flex items-center gap-2"
              >
                <span className="px-2 py-0.5 bg-ghost-red text-white rounded-[2px] font-mono text-[10px] font-bold shrink-0">
                  {idx + 1}. {c.name}
                </span>
                <input
                  type="text"
                  value={customMessages[c.id] ?? ''}
                  onChange={(e) =>
                    setCustomMessages((prev) => ({
                      ...prev,
                      [c.id]: e.target.value,
                    }))
                  }
                  placeholder={`Message for ${c.name}…`}
                  className="flex-1 bg-transparent text-xs font-medium text-ghost-ink placeholder:text-ghost-muted focus:outline-none min-w-0"
                />
              </div>
            ))}
          </div>
        ) : (
          <textarea
            rows={2}
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            placeholder={
              isMultiBatch
                ? `Write message for all ${activeMultiContacts.length} contacts…`
                : 'Write your WhatsApp message…'
            }
            className="box-input w-full px-3 py-2.5 text-sm font-medium placeholder:text-ghost-muted resize-none"
          />
        )}

        {/* Primary Action Row: Crisp Outlined Button + Crisp Solid Button */}
        <div className="grid grid-cols-5 gap-2 pt-1">
          <button
            type="button"
            onClick={handlePreview}
            className="col-span-2 btn-outline-red py-3"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {nativeMode ? 'Send Now' : 'Test'}
          </button>

          <button
            type="button"
            onClick={handleSchedule}
            className="col-span-3 btn-solid py-3 shadow-neon"
          >
            {scheduledToast ? (
              <>
                <Check className="w-4 h-4" />
                Scheduled
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                {isMultiBatch
                  ? `Schedule [${activeMultiContacts.length}] · ${formatTime12h(
                      time24
                    )}`
                  : `Schedule · ${formatTime12h(time24)}`}
              </>
            )}
          </button>
        </div>
      </section>

      {/* LONG-TAP CONTACT ACTION MODAL (Boxy Outlined + Solid Buttons) */}
      {menuContact && (
        <div
          onClick={closeContactMenu}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-[2px] p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs box-card shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2.5 border-b-[1.5px] border-ghost-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-[2px] bg-ghost-red text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                  {menuContact.initials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ghost-ink truncate flex items-center gap-1">
                    <span>{menuContact.name}</span>
                    {menuContact.isFavourite && (
                      <Star className="w-3.5 h-3.5 text-ghost-red fill-current shrink-0" />
                    )}
                  </div>
                  <div className="text-xs font-mono text-ghost-muted truncate">
                    {menuContact.phone}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={closeContactMenu}
                className="btn-outline p-1.5"
                aria-label="Close options"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!editingInSheet ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    onToggleFavouriteContact(menuContact.id);
                    closeContactMenu();
                  }}
                  className="btn-outline w-full justify-start px-3 py-2.5"
                >
                  <Star
                    className={`w-4 h-4 text-ghost-red ${
                      menuContact.isFavourite ? 'fill-current' : ''
                    }`}
                  />
                  <span>
                    {menuContact.isFavourite
                      ? 'Remove Favourite'
                      : 'Add Favourite'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditName(menuContact.name);
                    setEditPhone(menuContact.phone);
                    setEditingInSheet(true);
                  }}
                  className="btn-outline w-full justify-start px-3 py-2.5"
                >
                  <Pencil className="w-4 h-4 text-ghost-red" />
                  <span>Edit Contact</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDeleteContact(menuContact.id);
                    setSelectedMultiIds((prev) =>
                      prev.filter((id) => id !== menuContact.id)
                    );
                    closeContactMenu();
                  }}
                  className="btn-solid w-full justify-start px-3 py-2.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Contact</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveEditedContact} className="space-y-2.5">
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Contact Name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="box-input w-full px-3 py-2 text-xs font-medium"
                  />
                  <input
                    type="tel"
                    placeholder="+919820448210"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="box-input w-full px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingInSheet(false)}
                    className="btn-outline py-2.5"
                  >
                    Back
                  </button>
                  <button type="submit" className="btn-solid py-2.5">
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
