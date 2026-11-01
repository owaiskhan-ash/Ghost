import React, { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Download,
  Layers,
  Pencil,
  Play,
  Plus,
  Repeat,
  Search,
  Send,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  BatchRecipient,
  ContactGroup,
  RepeatMode,
  SavedContact,
  ScheduledWhatsAppTask,
  TargetWhatsApp,
} from '../types/ghost';
import {
  computeNextTaskTrigger,
  formatTime24h,
  getTodayOrTomorrowDate,
  hasDynamicVariables,
  makeInitials,
  resolveMessageVariables,
} from '../data/seedData';
import {
  fetchPhoneContactsForBulkImport,
  isRunningInNativeApk,
} from '../bridge/nativeBridge';

interface CommandDeckProps {
  contacts: SavedContact[];
  groups: ContactGroup[];
  onBulkAddContacts: (items: SavedContact[]) => void;
  onToggleFavouriteContact: (id: string) => void;
  onEditContact: (id: string, name: string, phone: string) => void;
  onDeleteContact: (id: string) => void;
  onSaveGroup: (group: ContactGroup) => void;
  onDeleteGroup: (id: string) => void;
  onScheduleTask: (task: ScheduledWhatsAppTask) => void;
  onPreviewOrSendNow: (task: ScheduledWhatsAppTask) => void;
}

function normalizeDigitsKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function parseVcfOrBulkLines(raw: string): SavedContact[] {
  const results: SavedContact[] = [];
  const seen = new Set<string>();

  if (/BEGIN:VCARD/i.test(raw)) {
    const cards = raw.split(/END:VCARD/i);
    cards.forEach((card, idx) => {
      const fnMatch = card.match(/^FN[^:]*:(.+)$/im);
      const telMatch = card.match(/^TEL[^:]*:(.+)$/im);
      if (telMatch) {
        const cleanPhone = telMatch[1].trim().replace(/[^\d+]/g, '');
        const key = normalizeDigitsKey(cleanPhone);
        if (key.length >= 5 && !seen.has(key)) {
          seen.add(key);
          const name = (fnMatch?.[1]?.trim() || cleanPhone).replace(/\\,/g, ',');
          results.push({
            id: `c-vcf-${Date.now()}-${idx}`,
            name,
            phone: cleanPhone,
            initials: makeInitials(name),
          });
        }
      }
    });
    return results;
  }

  const lines = raw.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,;\t|]+/);
    let name = '';
    let phone = '';
    if (parts.length >= 2) {
      name = parts[0].trim();
      phone = parts.slice(1).join('').replace(/[^\d+]/g, '');
    } else {
      const match = trimmed.match(/^(.*?)\s*([+\d][\d\s()-]{4,})$/);
      if (match) {
        name = match[1].trim();
        phone = match[2].replace(/[^\d+]/g, '');
      }
    }
    const key = normalizeDigitsKey(phone);
    if (key.length >= 5 && !seen.has(key)) {
      seen.add(key);
      const finalName = name || phone;
      results.push({
        id: `c-paste-${Date.now()}-${idx}`,
        name: finalName,
        phone,
        initials: makeInitials(finalName),
      });
    }
  });
  return results;
}

const WEEKDAY_PILLS = [
  { idx: 0, short: 'S', label: 'Sun' },
  { idx: 1, short: 'M', label: 'Mon' },
  { idx: 2, short: 'T', label: 'Tue' },
  { idx: 3, short: 'W', label: 'Wed' },
  { idx: 4, short: 'T', label: 'Thu' },
  { idx: 5, short: 'F', label: 'Fri' },
  { idx: 6, short: 'S', label: 'Sat' },
] as const;

const DYNAMIC_TOKENS = ['{name}', '{date}', '{day}'] as const;
const LONG_PRESS_MS = 420;

export const CommandDeck: React.FC<CommandDeckProps> = ({
  contacts,
  groups,
  onBulkAddContacts,
  onToggleFavouriteContact,
  onEditContact,
  onDeleteContact,
  onSaveGroup,
  onDeleteGroup,
  onScheduleTask,
  onPreviewOrSendNow,
}) => {
  const nativeMode = isRunningInNativeApk();
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const vcfInputRef = useRef<HTMLInputElement | null>(null);

  const sortedContacts = useMemo(() => {
    const favs = contacts.filter((c) => c.isFavourite);
    const others = contacts.filter((c) => !c.isFavourite);
    return [...favs, ...others];
  }, [contacts]);

  // Recipient Picker Tab: Contacts vs Broadcast Groups
  const [recipientTab, setRecipientTab] = useState<'contacts' | 'groups'>(
    'contacts'
  );
  const [multiMode, setMultiMode] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedMultiIds, setSelectedMultiIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Bulk Import Phone Contacts (Multi-Select Picker) state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkPermissionDenied, setBulkPermissionDenied] = useState(false);
  const [bulkCandidates, setBulkCandidates] = useState<SavedContact[]>([]);
  const [bulkSelectedPhones, setBulkSelectedPhones] = useState<string[]>([]);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkPasteText, setBulkPasteText] = useState('');

  // Message composer state
  const [messageMode, setMessageMode] = useState<'same' | 'custom'>('same');
  const [messageBody, setMessageBody] = useState('');
  const [customMessages, setCustomMessages] = useState<Record<string, string>>(
    {}
  );

  // Schedule Time, Custom Recurrence & App state
  const [time24, setTime24] = useState('09:00');
  const [dateStr, setDateStr] = useState(() => getTodayOrTomorrowDate('09:00'));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once');
  const [repeatDays, setRepeatDays] = useState<number[]>(() => [
    new Date().getDay(),
  ]);
  const [repeatMonthDay, setRepeatMonthDay] = useState<number>(() =>
    new Date().getDate()
  );
  const [repeatIntervalDays, setRepeatIntervalDays] = useState<number>(3);

  const [whatsappPackage, setWhatsappPackage] =
    useState<TargetWhatsApp>('com.whatsapp');
  const [scheduledToast, setScheduledToast] = useState(false);
  const [validationHint, setValidationHint] = useState<string | null>(null);

  // Create Broadcast Group inline form
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);

  // Long-press Contact menu state
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [menuContactId, setMenuContactId] = useState<string | null>(null);
  const [editingInSheet, setEditingInSheet] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Long-press Group menu state
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [editingGroupInSheet, setEditingGroupInSheet] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupMembers, setEditGroupMembers] = useState<string[]>([]);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef(false);

  const existingPhoneKeys = useMemo(
    () => new Set(contacts.map((c) => normalizeDigitsKey(c.phone))),
    [contacts]
  );

  const filteredBulkCandidates = useMemo(() => {
    const q = bulkSearch.trim().toLowerCase();
    if (!q) return bulkCandidates;
    return bulkCandidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [bulkCandidates, bulkSearch]);

  const selectableBulkCandidates = useMemo(
    () =>
      filteredBulkCandidates.filter(
        (c) => !existingPhoneKeys.has(normalizeDigitsKey(c.phone))
      ),
    [existingPhoneKeys, filteredBulkCandidates]
  );

  const allVisibleBulkSelected =
    selectableBulkCandidates.length > 0 &&
    selectableBulkCandidates.every((c) =>
      bulkSelectedPhones.includes(c.phone)
    );

  const menuContact = useMemo(
    () => contacts.find((c) => c.id === menuContactId) || null,
    [contacts, menuContactId]
  );

  const menuGroup = useMemo(
    () => groups.find((g) => g.id === menuGroupId) || null,
    [groups, menuGroupId]
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

  const activeGroup: ContactGroup | null = useMemo(() => {
    if (groups.length === 0) return null;
    return groups.find((g) => g.id === selectedGroupId) || groups[0];
  }, [groups, selectedGroupId]);

  const activeGroupContacts: SavedContact[] = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.memberIds
      .map((id) => contacts.find((c) => c.id === id))
      .filter((c): c is SavedContact => Boolean(c));
  }, [activeGroup, contacts]);

  const effectiveBatchContacts: SavedContact[] = useMemo(() => {
    if (recipientTab === 'groups') {
      return activeGroupContacts;
    }
    if (multiMode) {
      return activeMultiContacts;
    }
    return activeSingleContact ? [activeSingleContact] : [];
  }, [
    recipientTab,
    activeGroupContacts,
    multiMode,
    activeMultiContacts,
    activeSingleContact,
  ]);

  const isMultiBatch = effectiveBatchContacts.length > 1;

  const previewSampleName =
    effectiveBatchContacts[0]?.name || 'Contact';

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressingId(null);
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

  const openGroupMenu = (group: ContactGroup) => {
    clearLongPressTimer();
    try {
      navigator.vibrate?.(16);
    } catch {}
    setMenuGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupMembers(group.memberIds);
    setEditingGroupInSheet(false);
  };

  const handlePointerDownItem = (
    id: string,
    onHold: () => void,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    didLongPressRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    setPressingId(id);

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      onHold();
    }, LONG_PRESS_MS);
  };

  const handlePointerMoveItem = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerStartRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    if (dx > 10 || dy > 10) {
      clearLongPressTimer();
    }
  };

  const handleTapContact = (c: SavedContact) => {
    setValidationHint(null);
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
    const h24 = Math.min(23, Math.max(0, Number(hStr) || 0));
    const min = Math.min(59, Math.max(0, Number(mStr) || 0));
    return { h24, min };
  }, [time24]);

  const updateTimeParts = (h24: number, min: number) => {
    const nextTime = `${String(h24).padStart(2, '0')}:${String(min).padStart(
      2,
      '0'
    )}`;
    setTime24(nextTime);
    setDateStr(getTodayOrTomorrowDate(nextTime));
  };

  const toggleRepeatWeekday = (dayIdx: number) => {
    setRepeatDays((prev) => {
      if (prev.includes(dayIdx)) {
        if (prev.length <= 1) return prev;
        return prev.filter((d) => d !== dayIdx);
      }
      return [...prev, dayIdx].sort((a, b) => a - b);
    });
  };

  // Open Multi-Select Bulk Contact Picker
  const handleOpenBulkImport = async () => {
    setBulkPermissionDenied(false);
    setBulkSearch('');
    setBulkSelectedPhones([]);
    setShowBulkModal(true);
    setBulkLoading(true);

    const mode = await fetchPhoneContactsForBulkImport(
      (loaded) => {
        setBulkLoading(false);
        if (loaded.length > 0) {
          setBulkCandidates(loaded);
          // Pre-select nothing if coming from full phone book, or pre-select all if returned from Web Contact Picker
        }
      },
      () => {
        setBulkLoading(false);
        setBulkPermissionDenied(true);
      }
    );

    if (mode === 'web_picker') {
      setBulkLoading(false);
    }
  };

  const toggleBulkCandidate = (phone: string) => {
    setBulkSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  };

  const toggleBulkSelectAllVisible = () => {
    if (allVisibleBulkSelected) {
      const visibleSet = new Set(selectableBulkCandidates.map((c) => c.phone));
      setBulkSelectedPhones((prev) => prev.filter((p) => !visibleSet.has(p)));
    } else {
      const next = new Set(bulkSelectedPhones);
      selectableBulkCandidates.forEach((c) => next.add(c.phone));
      setBulkSelectedPhones(Array.from(next));
    }
  };

  const handleLoadBulkTextOrVcf = (raw: string) => {
    const parsed = parseVcfOrBulkLines(raw);
    if (parsed.length === 0) return;
    setBulkCandidates((prev) => {
      const map = new Map<string, SavedContact>();
      for (const item of [...parsed, ...prev]) {
        map.set(normalizeDigitsKey(item.phone), item);
      }
      return Array.from(map.values());
    });
    const autoSelect = parsed
      .filter((c) => !existingPhoneKeys.has(normalizeDigitsKey(c.phone)))
      .map((c) => c.phone);
    setBulkSelectedPhones((prev) =>
      Array.from(new Set([...prev, ...autoSelect]))
    );
    setBulkPasteText('');
  };

  const handleVcfFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleLoadBulkTextOrVcf(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmBulkImport = () => {
    const selectedItems = bulkCandidates.filter((c) =>
      bulkSelectedPhones.includes(c.phone)
    );
    if (selectedItems.length === 0) return;
    onBulkAddContacts(selectedItems);
    if (!selectedContactId && selectedItems[0]) {
      setSelectedContactId(selectedItems[0].id);
    }
    setShowBulkModal(false);
    setBulkSelectedPhones([]);
    setValidationHint(null);
  };

  const handleSaveEditedContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuContact || !editName.trim() || !editPhone.trim()) return;
    const cleanPhone = editPhone.replace(/[^\d+]/g, '');
    if (!cleanPhone) return;
    onEditContact(menuContact.id, editName.trim(), cleanPhone);
    setMenuContactId(null);
    setEditingInSheet(false);
  };

  const handleCreateBroadcastGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupNameInput.trim() || groupMemberIds.length === 0) return;
    const created: ContactGroup = {
      id: `grp-${Date.now()}`,
      name: groupNameInput.trim(),
      memberIds: groupMemberIds,
    };
    onSaveGroup(created);
    setSelectedGroupId(created.id);
    setGroupNameInput('');
    setGroupMemberIds([]);
    setShowCreateGroup(false);
    setValidationHint(null);
  };

  const handleSaveEditedGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuGroup || !editGroupName.trim() || editGroupMembers.length === 0) {
      return;
    }
    onSaveGroup({
      id: menuGroup.id,
      name: editGroupName.trim(),
      memberIds: editGroupMembers,
    });
    setMenuGroupId(null);
    setEditingGroupInSheet(false);
  };

  const insertDynamicToken = (token: string) => {
    setValidationHint(null);
    const el = messageInputRef.current;
    if (el) {
      const start = el.selectionStart ?? messageBody.length;
      const end = el.selectionEnd ?? messageBody.length;
      const next =
        messageBody.slice(0, start) + token + messageBody.slice(end);
      setMessageBody(next);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + token.length;
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      setMessageBody((prev) =>
        prev && !prev.endsWith(' ') ? `${prev} ${token}` : `${prev}${token}`
      );
    }
  };

  const buildTask = (): ScheduledWhatsAppTask | null => {
    if (effectiveBatchContacts.length === 0) {
      if (recipientTab === 'groups') {
        if (contacts.length === 0) {
          setRecipientTab('contacts');
          void handleOpenBulkImport();
          setValidationHint('Import contacts first');
        } else {
          setShowCreateGroup(true);
          setValidationHint('Create or select a broadcast group');
        }
      } else {
        void handleOpenBulkImport();
        setValidationHint('Import a contact first');
      }
      return null;
    }

    const computedNext = computeNextTaskTrigger({
      scheduledDate: dateStr,
      scheduledTime24: time24,
      repeatMode,
      repeatDays,
      repeatMonthDay,
      repeatIntervalDays,
    });

    if (effectiveBatchContacts.length === 1) {
      const target = effectiveBatchContacts[0];
      const text = messageBody.trim();
      if (!text) {
        setValidationHint('Enter a message');
        messageInputRef.current?.focus();
        return null;
      }
      setValidationHint(null);
      return {
        id: `task-${Date.now()}`,
        contactId: target.id,
        contactName:
          recipientTab === 'groups' && activeGroup
            ? `${activeGroup.name} (${target.name})`
            : target.name,
        contactPhone: target.phone,
        contactInitials: target.initials,
        groupId:
          recipientTab === 'groups' && activeGroup ? activeGroup.id : undefined,
        groupName:
          recipientTab === 'groups' && activeGroup
            ? activeGroup.name
            : undefined,
        messageBody: text,
        scheduledTime24: time24,
        scheduledDate: computedNext.nextDateStr,
        triggerAtMillis: computedNext.triggerAtMillis,
        repeatMode,
        repeatDays: repeatMode === 'weekly' ? repeatDays : undefined,
        repeatMonthDay: repeatMode === 'monthly' ? repeatMonthDay : undefined,
        repeatIntervalDays:
          repeatMode === 'interval' ? repeatIntervalDays : undefined,
        whatsappPackage,
        enabled: true,
      };
    }

    const sharedText = messageBody.trim();
    if (messageMode === 'same' && !sharedText) {
      setValidationHint('Enter a broadcast message');
      messageInputRef.current?.focus();
      return null;
    }

    const recipients: BatchRecipient[] = [];
    for (const c of effectiveBatchContacts) {
      const msg =
        messageMode === 'custom'
          ? (customMessages[c.id] ?? '').trim() || sharedText
          : sharedText;
      if (!msg) {
        setValidationHint(`Enter a message for ${c.name}`);
        return null;
      }
      recipients.push({
        contactId: c.id,
        contactName: c.name,
        contactPhone: c.phone,
        contactInitials: c.initials,
        messageBody: msg,
      });
    }

    setValidationHint(null);
    const first = recipients[0];
    const summaryLabel =
      recipientTab === 'groups' && activeGroup
        ? `${activeGroup.name} (${recipients.length})`
        : recipients.length === 2
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
      groupId:
        recipientTab === 'groups' && activeGroup ? activeGroup.id : undefined,
      groupName:
        recipientTab === 'groups' && activeGroup ? activeGroup.name : undefined,
      messageBody:
        messageMode === 'same'
          ? first.messageBody
          : `${recipients.length} custom messages`,
      recipients,
      scheduledTime24: time24,
      scheduledDate: computedNext.nextDateStr,
      triggerAtMillis: computedNext.triggerAtMillis,
      repeatMode,
      repeatDays: repeatMode === 'weekly' ? repeatDays : undefined,
      repeatMonthDay: repeatMode === 'monthly' ? repeatMonthDay : undefined,
      repeatIntervalDays:
        repeatMode === 'interval' ? repeatIntervalDays : undefined,
      whatsappPackage,
      enabled: true,
    };
  };

  const handleSchedule = () => {
    const task = buildTask();
    if (!task) return;
    onScheduleTask(task);
    setScheduledToast(true);
    setTimeout(() => setScheduledToast(false), 2000);
  };

  const handlePreview = () => {
    const task = buildTask();
    if (!task) return;
    onPreviewOrSendNow(task);
  };

  const toggleMemberInDraft = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="command-deck soft-screen grid grid-cols-12">
      {/* BENTO TILE 1 (12 cols): Contacts, Bulk Import & Broadcast Groups */}
      <section className="col-span-12 bento-card p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="soft-segment">
            <button
              type="button"
              onClick={() => {
                setRecipientTab('contacts');
                setValidationHint(null);
              }}
              className={`soft-segment-button px-3 py-1.5 text-[11px] font-semibold ${
                recipientTab === 'contacts' ? 'is-active' : ''
              }`}
            >
              Contacts{contacts.length > 0 ? ` · ${contacts.length}` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                setRecipientTab('groups');
                setValidationHint(null);
              }}
              className={`soft-segment-button px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1 ${
                recipientTab === 'groups' ? 'is-active' : ''
              }`}
            >
              <Layers className="w-3 h-3" />
              Groups{groups.length > 0 ? ` · ${groups.length}` : ''}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {recipientTab === 'contacts' && sortedContacts.length > 1 && (
              <button
                type="button"
                onClick={toggleMultiMode}
                className={
                  multiMode
                    ? 'btn-solid is-active px-2 py-1 text-[11px] rounded-lg'
                    : 'btn-outline px-2 py-1 text-[11px] rounded-lg'
                }
              >
                <Users className="w-3 h-3" />
                Multi
              </button>
            )}

            {recipientTab === 'contacts' && (
              <button
                type="button"
                onClick={handleOpenBulkImport}
                className="btn-outline px-2.5 py-1 text-[11px] rounded-lg"
                title="Bulk Import Phone Contacts"
              >
                <Download className="w-3 h-3" />
                Import
              </button>
            )}

            {recipientTab === 'groups' && (
              <button
                type="button"
                onClick={() => setShowCreateGroup((v) => !v)}
                className={
                  showCreateGroup
                    ? 'btn-solid is-active px-2.5 py-1 text-[11px] rounded-lg'
                    : 'btn-outline px-2.5 py-1 text-[11px] rounded-lg'
                }
              >
                <Plus className="w-3 h-3" />
                Group
              </button>
            )}
          </div>
        </div>

        {/* CONTACTS MODE */}
        {recipientTab === 'contacts' && (
          <>
            {sortedContacts.length === 0 && (
              <div className="soft-lock-row !min-h-[64px]">
                <span className="soft-icon-well">
                  <Download />
                </span>
                <div className="soft-row-copy">
                  <div className="soft-row-title">Import contacts</div>
                  <div className="soft-row-meta">
                    Choose one or multiple contacts from your phone
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenBulkImport}
                  className="soft-pill text-ghost-accent"
                >
                  Import
                </button>
              </div>
            )}

            {sortedContacts.length > 0 && (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
                {sortedContacts.map((c) => {
                  const multiOrderIdx = activeMultiContacts.findIndex(
                    (mc) => mc.id === c.id
                  );
                  const selected = multiMode
                    ? multiOrderIdx !== -1
                    : activeSingleContact?.id === c.id;
                  const isPressing = pressingId === c.id;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onPointerDown={(e) =>
                        handlePointerDownItem(c.id, () => openContactMenu(c), e)
                      }
                      onPointerMove={handlePointerMoveItem}
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
                      className={`no-touch-callout touch-manipulation p-2.5 rounded-xl text-xs transition flex items-center gap-2 border text-left ${
                        isPressing ? 'scale-[0.97] ring-2 ring-ghost-accent' : ''
                      } ${
                        selected
                          ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent shadow-neonSm'
                          : 'bg-ghost-elevated text-ghost-ink border-ghost-border/20 dark:border-ghost-border hover:border-ghost-accent'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg font-mono text-[10px] font-bold flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-ghost-accentInk/15 text-ghost-accentInk'
                            : 'bg-ghost-surface text-ghost-ink'
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
                                selected
                                  ? 'text-ghost-accentInk'
                                  : 'text-ghost-accent'
                              }`}
                            />
                          )}
                        </div>
                        <div
                          className={`text-[10px] font-mono leading-tight truncate mt-0.5 ${
                            selected ? 'opacity-75' : 'text-ghost-muted'
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
          </>
        )}

        {/* BROADCAST GROUPS MODE */}
        {recipientTab === 'groups' && (
          <>
            {contacts.length === 0 ? (
              <div className="p-3 bg-ghost-elevated rounded-xl flex items-center justify-between gap-2 text-xs">
                <span className="text-ghost-secondary">
                  Import contacts first.
                </span>
                <button
                  type="button"
                  onClick={handleOpenBulkImport}
                  className="btn-solid px-3 py-1.5 rounded-lg shrink-0"
                >
                  Import Contacts
                </button>
              </div>
            ) : (
              <>
                {(showCreateGroup || groups.length === 0) && (
                  <form
                    onSubmit={handleCreateBroadcastGroup}
                    className="p-2.5 bg-ghost-elevated/60 rounded-xl space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Broadcast list name (e.g. Family, Team)"
                        value={groupNameInput}
                        onChange={(e) => setGroupNameInput(e.target.value)}
                        className="bento-input flex-1 px-2.5 py-1.5 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={
                          !groupNameInput.trim() || groupMemberIds.length === 0
                        }
                        className="btn-solid px-3 py-1.5 shrink-0 rounded-xl disabled:opacity-40"
                      >
                        Save ({groupMemberIds.length})
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {sortedContacts.map((c) => {
                        const checked = groupMemberIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              toggleMemberInDraft(c.id, setGroupMemberIds)
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1 ${
                              checked
                                ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent'
                                : 'bg-ghost-surface text-ghost-secondary border-ghost-border/25 dark:border-ghost-border'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                            <span>{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </form>
                )}

                {groups.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {groups.map((grp) => {
                      const validMembers = grp.memberIds
                        .map((id) => contacts.find((c) => c.id === id))
                        .filter((c): c is SavedContact => Boolean(c));
                      const selected = activeGroup?.id === grp.id;
                      const isPressing = pressingId === grp.id;

                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onPointerDown={(e) =>
                            handlePointerDownItem(
                              grp.id,
                              () => openGroupMenu(grp),
                              e
                            )
                          }
                          onPointerMove={handlePointerMoveItem}
                          onPointerUp={clearLongPressTimer}
                          onPointerLeave={clearLongPressTimer}
                          onPointerCancel={clearLongPressTimer}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            didLongPressRef.current = true;
                            openGroupMenu(grp);
                          }}
                          onClick={(e) => {
                            if (didLongPressRef.current) {
                              didLongPressRef.current = false;
                              e.preventDefault();
                              return;
                            }
                            setSelectedGroupId(grp.id);
                            setValidationHint(null);
                          }}
                          className={`no-touch-callout touch-manipulation p-2.5 rounded-xl text-xs transition flex items-center gap-2 border text-left ${
                            isPressing
                              ? 'scale-[0.97] ring-2 ring-ghost-accent'
                              : ''
                          } ${
                            selected
                              ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent shadow-neonSm'
                              : 'bg-ghost-elevated text-ghost-ink border-ghost-border/20 dark:border-ghost-border hover:border-ghost-accent'
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-lg font-mono text-[10px] font-bold flex items-center justify-center shrink-0 ${
                              selected
                                ? 'bg-ghost-accentInk/15 text-ghost-accentInk'
                                : 'bg-ghost-surface text-ghost-ink'
                            }`}
                          >
                            {validMembers.length}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate">{grp.name}</div>
                            <div
                              className={`text-[10px] truncate mt-0.5 ${
                                selected ? 'opacity-75' : 'text-ghost-muted'
                              }`}
                            >
                              {validMembers.map((m) => m.name).join(', ') ||
                                '0 members'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/* BENTO TILE 2 (7 cols): Time Selector */}
      <section className="col-span-7 bento-card p-3.5 flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between gap-1">
          <span className="soft-section-title flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ghost-accent" />
            <span>Time</span>
          </span>
          <span className="text-[10px] font-medium text-ghost-muted">24-hour</span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <select
            aria-label="Hour (24-hour)"
            value={parsedTime.h24}
            onChange={(e) =>
              updateTimeParts(Number(e.target.value), parsedTime.min)
            }
            className="w-full appearance-none bento-input px-2 py-2 font-mono text-xl font-bold text-center cursor-pointer"
          >
            {Array.from({ length: 24 }, (_, h) => h).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}
              </option>
            ))}
          </select>

          <span className="font-mono text-lg font-bold text-ghost-accent">
            :
          </span>

          <select
            aria-label="Minute"
            value={parsedTime.min}
            onChange={(e) =>
              updateTimeParts(parsedTime.h24, Number(e.target.value))
            }
            className="w-full appearance-none bento-input px-2 py-2 font-mono text-xl font-bold text-center cursor-pointer"
          >
            {Array.from({ length: 60 }, (_, m) => m).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        <div className="bento-input px-2.5 py-1.5 flex items-center gap-1.5">
          <Calendar className="w-3 h-3 text-ghost-accent shrink-0" />
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            disabled={
              repeatMode === 'daily' ||
              repeatMode === 'weekly' ||
              repeatMode === 'monthly'
            }
            className="w-full bg-transparent text-[11px] font-mono font-medium text-ghost-ink focus:outline-none disabled:opacity-40"
          />
        </div>
      </section>

      {/* BENTO TILE 3 (5 cols): App Target */}
      <section className="col-span-5 bento-card p-3.5 flex flex-col justify-between gap-2.5">
        <span className="soft-section-title block">App</span>
        <div className="grid grid-cols-1 gap-2 my-auto">
          <button
            type="button"
            onClick={() => setWhatsappPackage('com.whatsapp')}
            className={
              whatsappPackage === 'com.whatsapp'
                ? 'btn-solid is-active py-2.5 text-xs rounded-xl'
                : 'btn-outline py-2.5 text-xs rounded-xl'
            }
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setWhatsappPackage('com.whatsapp.w4b')}
            className={
              whatsappPackage === 'com.whatsapp.w4b'
                ? 'btn-solid is-active py-2.5 text-xs rounded-xl'
                : 'btn-outline py-2.5 text-xs rounded-xl'
            }
          >
            WA Business
          </button>
        </div>
      </section>

      {/* BENTO TILE 4 (12 cols): Custom Recurring Schedule Selector */}
      <section className="soft-schedule-card col-span-12 bento-card">
        <div className="flex items-center justify-between gap-2">
          <span className="soft-section-title flex items-center gap-1.5 shrink-0">
            <Repeat className="w-3.5 h-3.5 text-ghost-accent" />
            <span>Schedule</span>
          </span>
          <span className="text-[10px] font-medium text-ghost-muted">
            Repeat pattern
          </span>
        </div>

        <div
          className="soft-schedule-grid"
          role="group"
          aria-label="Repeat schedule"
        >
          {(
            [
              { id: 'once', label: 'Once' },
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'interval', label: 'Custom' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setRepeatMode(m.id)}
              aria-pressed={repeatMode === m.id}
              className={`soft-schedule-mode ${
                m.id === 'once' ? 'is-once' : ''
              } ${repeatMode === m.id ? 'is-active' : ''}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Weekly Weekday Picker */}
        {repeatMode === 'weekly' && (
          <div className="grid grid-cols-7 gap-1.5 pt-0.5">
            {WEEKDAY_PILLS.map((d) => {
              const active = repeatDays.includes(d.idx);
              return (
                <button
                  key={d.idx}
                  type="button"
                  title={d.label}
                  onClick={() => toggleRepeatWeekday(d.idx)}
                  className={`py-1.5 rounded-xl font-mono text-xs font-bold border transition ${
                    active
                      ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent shadow-neonSm'
                      : 'bg-ghost-elevated text-ghost-secondary border-transparent hover:border-ghost-accent'
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        )}

        {/* Monthly Day-of-Month Picker */}
        {repeatMode === 'monthly' && (
          <div className="flex items-center justify-between bg-ghost-elevated rounded-xl px-3 py-1.5">
            <span className="text-xs font-medium text-ghost-secondary">
              Send every month on day
            </span>
            <select
              aria-label="Day of month"
              value={repeatMonthDay}
              onChange={(e) => setRepeatMonthDay(Number(e.target.value))}
              className="bento-input px-2.5 py-1 font-mono text-xs font-bold cursor-pointer"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Custom Every N Days Picker */}
        {repeatMode === 'interval' && (
          <div className="flex items-center justify-between bg-ghost-elevated rounded-xl px-3 py-1.5">
            <span className="text-xs font-medium text-ghost-secondary">
              Repeat every
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={2}
                max={365}
                value={repeatIntervalDays}
                onChange={(e) =>
                  setRepeatIntervalDays(
                    Math.min(365, Math.max(2, Number(e.target.value) || 2))
                  )
                }
                className="bento-input w-16 px-2 py-1 text-center font-mono text-xs font-bold"
              />
              <span className="text-xs font-mono font-semibold text-ghost-ink">
                days
              </span>
            </div>
          </div>
        )}
      </section>

      {/* BENTO TILE 5 (12 cols): Dynamic Variables & Composer */}
      <section className="col-span-12 bento-card p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="soft-section-title">Message</span>

          {isMultiBatch && (
            <div className="soft-segment">
              <button
                type="button"
                onClick={() => setMessageMode('same')}
                className={`soft-segment-button px-2.5 py-1 text-[10px] font-semibold ${
                  messageMode === 'same' ? 'is-active' : ''
                }`}
              >
                Same
              </button>
              <button
                type="button"
                onClick={() => setMessageMode('custom')}
                className={`soft-segment-button px-2.5 py-1 text-[10px] font-semibold ${
                  messageMode === 'custom' ? 'is-active' : ''
                }`}
              >
                Per Person
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Variable Chips ({name}, {date}, {day}) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {DYNAMIC_TOKENS.map((tok) => (
            <button
              key={tok}
              type="button"
              onClick={() => insertDynamicToken(tok)}
              className="soft-pill !min-h-[30px] !px-3 text-[10px] font-semibold"
            >
              + {tok}
            </button>
          ))}
        </div>

        {isMultiBatch && messageMode === 'custom' ? (
          <div className="space-y-1.5">
            {effectiveBatchContacts.map((c, idx) => (
              <div
                key={c.id}
                className="bento-input px-2.5 py-2 flex items-center gap-2"
              >
                <span className="px-2 py-0.5 bg-ghost-accent text-ghost-accentInk rounded-md font-mono text-[10px] font-bold shrink-0">
                  {idx + 1}. {c.name}
                </span>
                <input
                  type="text"
                  value={customMessages[c.id] ?? ''}
                  onChange={(e) => {
                    setValidationHint(null);
                    setCustomMessages((prev) => ({
                      ...prev,
                      [c.id]: e.target.value,
                    }));
                  }}
                  placeholder={`Message for ${c.name}…`}
                  className="flex-1 bg-transparent text-xs font-medium text-ghost-ink placeholder:text-ghost-muted focus:outline-none min-w-0"
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <textarea
              ref={messageInputRef}
              rows={2}
              value={messageBody}
              onChange={(e) => {
                setValidationHint(null);
                setMessageBody(e.target.value);
              }}
              placeholder={
                recipientTab === 'groups' && activeGroup
                  ? `Broadcast to ${activeGroup.name}… (supports {name}, {date}, {day})`
                  : isMultiBatch
                    ? `Message for ${effectiveBatchContacts.length} contacts…`
                    : 'Write message…'
              }
              className="bento-input w-full px-3 py-2.5 text-sm font-medium placeholder:text-ghost-muted resize-none"
            />

            {/* Minimal Live Variable Preview ONLY when {name}/{date}/{day} is used */}
            {hasDynamicVariables(messageBody) && (
              <div className="px-2.5 py-1.5 rounded-xl bg-ghost-elevated text-[11px] text-ghost-secondary flex items-center gap-1.5 truncate">
                <span className="font-mono font-bold text-ghost-accent shrink-0">
                  →
                </span>
                <span className="truncate">
                  {resolveMessageVariables(messageBody, previewSampleName)}
                </span>
              </div>
            )}
          </>
        )}

        {validationHint && (
          <div className="text-[11px] font-semibold text-ghost-accent px-1">
            {validationHint}
          </div>
        )}

        <div className="soft-dispatch-bar">
          <button
            type="button"
            onClick={handlePreview}
            className="soft-action-circle"
            title={nativeMode ? 'Send now' : 'Test dispatch'}
            aria-label={nativeMode ? 'Send now' : 'Test dispatch'}
          >
            <Play className="fill-current" />
          </button>

          <div className="soft-dispatch-copy">
            <div className="soft-dispatch-title">
              {isMultiBatch
                ? `${effectiveBatchContacts.length} recipient dispatch`
                : effectiveBatchContacts[0]?.name || 'New dispatch'}
            </div>
            <div className="soft-dispatch-meta">
              {whatsappPackage === 'com.whatsapp.w4b'
                ? 'WA Business'
                : 'WhatsApp'}{' '}
              · {formatTime24h(time24)} · {repeatMode}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSchedule}
            className="soft-dispatch-button"
          >
            {scheduledToast ? (
              <>
                <Check className="w-4 h-4" /> Scheduled
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Schedule
              </>
            )}
          </button>
        </div>
      </section>

      {/* BULK IMPORT PHONE CONTACTS (MULTI-SELECT PICKER) MODAL */}
      {showBulkModal && (
        <div
          onClick={() => setShowBulkModal(false)}
          className="soft-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="soft-modal soft-contact-picker-modal w-full max-w-sm"
          >
            <div className="soft-contact-picker-header">
              <span className="soft-icon-well">
                <Users />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ghost-ink">
                  Import contacts
                </div>
                <div className="text-[11px] text-ghost-muted mt-0.5">
                  Choose one or multiple phone contacts
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="soft-round-button !w-9 !h-9 !basis-9"
                aria-label="Close contact import"
              >
                <X />
              </button>
            </div>

            {bulkLoading ? (
              <div className="py-10 text-center text-xs font-mono text-ghost-secondary">
                Reading phone contacts…
              </div>
            ) : bulkCandidates.length > 0 ? (
              <>
                <div className="soft-contact-picker-toolbar">
                  <div className="soft-contact-picker-search bento-input">
                    <Search className="w-4 h-4 text-ghost-muted shrink-0" />
                    <input
                      type="text"
                      placeholder="Search contacts…"
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      className="w-full bg-transparent text-xs text-ghost-ink focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={toggleBulkSelectAllVisible}
                    disabled={selectableBulkCandidates.length === 0}
                    className={`soft-picker-action ${
                      allVisibleBulkSelected ? 'is-active' : ''
                    }`}
                  >
                    {allVisibleBulkSelected ? 'Clear' : 'Select all'}
                  </button>
                </div>

                <div className="soft-contact-picker-list">
                  {filteredBulkCandidates.map((c) => {
                    const alreadySaved = existingPhoneKeys.has(
                      normalizeDigitsKey(c.phone)
                    );
                    const checked = bulkSelectedPhones.includes(c.phone);

                    return (
                      <button
                        key={`${c.id}-${c.phone}`}
                        type="button"
                        disabled={alreadySaved}
                        onClick={() => toggleBulkCandidate(c.phone)}
                        className={`soft-contact-picker-row ${
                          alreadySaved
                            ? 'is-saved'
                            : checked
                              ? 'is-selected'
                              : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`soft-contact-picker-avatar ${
                              checked ? 'is-selected' : ''
                            }`}
                          >
                            {c.initials}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">
                              {c.name}
                            </div>
                            <div
                              className={`text-[10px] font-mono truncate ${
                                checked ? 'opacity-80' : 'text-ghost-muted'
                              }`}
                            >
                              {c.phone}
                            </div>
                          </div>
                        </div>

                        {alreadySaved ? (
                          <span className="soft-contact-picker-saved">
                            Imported
                          </span>
                        ) : (
                          <span
                            className={`soft-contact-picker-check ${
                              checked ? 'is-selected' : ''
                            }`}
                          >
                            {checked && <Check className="w-3.5 h-3.5" />}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="space-y-2.5">
                {bulkPermissionDenied && (
                  <div className="p-2.5 rounded-xl bg-ghost-elevated text-[11px] text-ghost-accent font-medium">
                    Contacts permission was denied. Allow Contacts access or
                    upload a .vcf / paste below.
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ghost-secondary font-medium">
                    Paste lines (`Name, +Phone`) or upload `.vcf`
                  </span>
                  <input
                    ref={vcfInputRef}
                    type="file"
                    accept=".vcf,text/vcard,text/csv,text/plain"
                    onChange={handleVcfFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => vcfInputRef.current?.click()}
                    className="btn-outline px-2.5 py-1 text-[11px] rounded-lg shrink-0"
                  >
                    <Upload className="w-3 h-3" /> .vcf / CSV
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={bulkPasteText}
                  onChange={(e) => setBulkPasteText(e.target.value)}
                  placeholder={'Rahul, +919800000001\nPriya, +919800000002'}
                  className="bento-input w-full px-3 py-2 text-xs font-mono resize-none"
                />

                <button
                  type="button"
                  disabled={!bulkPasteText.trim()}
                  onClick={() => handleLoadBulkTextOrVcf(bulkPasteText)}
                  className="btn-outline w-full py-2 text-xs disabled:opacity-40"
                >
                  Load Into Picker
                </button>
              </div>
            )}

            <div className="soft-contact-picker-footer">
              <div className="soft-contact-picker-count">
                <span
                  className={`status-dot ${
                    bulkSelectedPhones.length === 0 ? 'is-muted' : ''
                  }`}
                />
                {bulkSelectedPhones.length === 0
                  ? 'No contacts selected'
                  : `${bulkSelectedPhones.length} selected`}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="btn-outline py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkSelectedPhones.length === 0}
                  onClick={handleConfirmBulkImport}
                  className="btn-solid py-2.5 disabled:opacity-40"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LONG-TAP CONTACT MODAL */}
      {menuContact && (
        <div
          onClick={() => {
            setMenuContactId(null);
            setEditingInSheet(false);
          }}
          className="soft-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="soft-modal w-full max-w-xs p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-ghost-border/25 dark:border-ghost-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-ghost-accent text-ghost-accentInk font-mono text-xs font-bold flex items-center justify-center shrink-0">
                  {menuContact.initials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ghost-ink truncate flex items-center gap-1">
                    <span>{menuContact.name}</span>
                    {menuContact.isFavourite && (
                      <Star className="w-3.5 h-3.5 text-ghost-accent fill-current shrink-0" />
                    )}
                  </div>
                  <div className="text-xs font-mono text-ghost-muted truncate">
                    {menuContact.phone}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMenuContactId(null);
                  setEditingInSheet(false);
                }}
                className="btn-outline p-1.5 rounded-lg"
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
                    setMenuContactId(null);
                  }}
                  className="btn-outline w-full justify-start px-3 py-2.5"
                >
                  <Star
                    className={`w-4 h-4 text-ghost-accent ${
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
                  <Pencil className="w-4 h-4 text-ghost-accent" />
                  <span>Edit Contact</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDeleteContact(menuContact.id);
                    setSelectedMultiIds((prev) =>
                      prev.filter((id) => id !== menuContact.id)
                    );
                    setMenuContactId(null);
                  }}
                  className="btn-outline danger-action w-full justify-start px-3 py-2.5"
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
                    className="bento-input w-full px-3 py-2 text-xs font-medium"
                  />
                  <input
                    type="tel"
                    placeholder="+Phone"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="bento-input w-full px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingInSheet(false)}
                    className="btn-outline py-2"
                  >
                    Back
                  </button>
                  <button type="submit" className="btn-solid py-2">
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* LONG-TAP BROADCAST GROUP MODAL */}
      {menuGroup && (
        <div
          onClick={() => {
            setMenuGroupId(null);
            setEditingGroupInSheet(false);
          }}
          className="soft-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="soft-modal w-full max-w-xs p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-ghost-border/25 dark:border-ghost-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-ghost-accent text-ghost-accentInk font-mono text-xs font-bold flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ghost-ink truncate">
                    {menuGroup.name}
                  </div>
                  <div className="text-xs text-ghost-muted truncate">
                    {menuGroup.memberIds.length} broadcast members
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMenuGroupId(null);
                  setEditingGroupInSheet(false);
                }}
                className="btn-outline p-1.5 rounded-lg"
                aria-label="Close group options"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!editingGroupInSheet ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditGroupName(menuGroup.name);
                    setEditGroupMembers(menuGroup.memberIds);
                    setEditingGroupInSheet(true);
                  }}
                  className="btn-outline w-full justify-start px-3 py-2.5"
                >
                  <Pencil className="w-4 h-4 text-ghost-accent" />
                  <span>Edit Group & Members</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDeleteGroup(menuGroup.id);
                    setMenuGroupId(null);
                  }}
                  className="btn-outline danger-action w-full justify-start px-3 py-2.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Broadcast Group</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveEditedGroup} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Group Name"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  autoFocus
                  className="bento-input w-full px-3 py-2 text-xs font-medium"
                />

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto py-1">
                  {sortedContacts.map((c) => {
                    const checked = editGroupMembers.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          toggleMemberInDraft(c.id, setEditGroupMembers)
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1 ${
                          checked
                            ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent'
                            : 'bg-ghost-elevated text-ghost-secondary border-transparent'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingGroupInSheet(false)}
                    className="btn-outline py-2"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={editGroupMembers.length === 0}
                    className="btn-solid py-2 disabled:opacity-40"
                  >
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
