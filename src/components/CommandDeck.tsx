import React, { useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
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
  Zap,
} from 'lucide-react';
import type {
  BatchRecipient,
  ContactGroup,
  QuickTemplate,
  RepeatMode,
  SavedContact,
  ScheduledWhatsAppTask,
  TargetWhatsApp,
} from '../types/ghost';
import {
  computeNextTaskTrigger,
  formatTime12h,
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
  templates: QuickTemplate[];
  onAddContact: (c: SavedContact) => void;
  onBulkAddContacts: (items: SavedContact[]) => void;
  onToggleFavouriteContact: (id: string) => void;
  onEditContact: (id: string, name: string, phone: string) => void;
  onDeleteContact: (id: string) => void;
  onSaveGroup: (group: ContactGroup) => void;
  onDeleteGroup: (id: string) => void;
  onAddTemplate: (tpl: QuickTemplate) => void;
  onDeleteTemplate: (id: string) => void;
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
  templates,
  onAddContact,
  onBulkAddContacts,
  onToggleFavouriteContact,
  onEditContact,
  onDeleteContact,
  onSaveGroup,
  onDeleteGroup,
  onAddTemplate,
  onDeleteTemplate,
  onScheduleTask,
  onPreviewOrSendNow,
}) => {
  const nativeMode = isRunningInNativeApk();
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);
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

  // Message & Quick Templates state
  const [messageMode, setMessageMode] = useState<'same' | 'custom'>('same');
  const [messageBody, setMessageBody] = useState('');
  const [customMessages, setCustomMessages] = useState<Record<string, string>>(
    {}
  );
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTplLabel, setNewTplLabel] = useState('');
  const [newTplText, setNewTplText] = useState('');
  const [templateSavedToast, setTemplateSavedToast] = useState(false);

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

  // Add Contact inline form
  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+');

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

  const applyQuickTime = (preset: '1m' | '5m' | '9am') => {
    if (preset === '1m') {
      const next = addMinutesFromNow(1);
      setTime24(next.time24);
      setDateStr(next.date);
    } else if (preset === '5m') {
      const next = addMinutesFromNow(5);
      setTime24(next.time24);
      setDateStr(next.date);
    } else if (preset === '9am') {
      setTime24('09:00');
      setDateStr(getTodayOrTomorrowDate('09:00'));
    }
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
    const unsavedVisible = filteredBulkCandidates.filter(
      (c) => !existingPhoneKeys.has(normalizeDigitsKey(c.phone))
    );
    const allSelected =
      unsavedVisible.length > 0 &&
      unsavedVisible.every((c) => bulkSelectedPhones.includes(c.phone));

    if (allSelected) {
      const visibleSet = new Set(unsavedVisible.map((c) => c.phone));
      setBulkSelectedPhones((prev) => prev.filter((p) => !visibleSet.has(p)));
    } else {
      const next = new Set(bulkSelectedPhones);
      unsavedVisible.forEach((c) => next.add(c.phone));
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

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    const cleanPhone = newPhone.replace(/[^\d+]/g, '');
    if (cleanPhone.replace(/\D/g, '').length < 5) return;
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
    setNewPhone('+');
    setShowAddContact(false);
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
    if (showAddTemplate && document.activeElement === templateInputRef.current) {
      setNewTplText((prev) =>
        prev && !prev.endsWith(' ') ? `${prev} ${token}` : `${prev}${token}`
      );
      templateInputRef.current?.focus();
      return;
    }

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

  const handleQuickSaveCurrentAsTemplate = () => {
    const trimmed = messageBody.trim();
    if (!trimmed) {
      setShowAddTemplate((v) => !v);
      return;
    }
    const alreadyExists = templates.some(
      (t) => t.text.toLowerCase() === trimmed.toLowerCase()
    );
    if (!alreadyExists) {
      const shortLabel =
        trimmed.length > 20 ? `${trimmed.slice(0, 20).trim()}…` : trimmed;
      onAddTemplate({
        id: `tpl-${Date.now()}`,
        label: shortLabel,
        text: trimmed,
      });
    }
    setTemplateSavedToast(true);
    setTimeout(() => setTemplateSavedToast(false), 1600);
  };

  const handleSaveCustomTemplateForm = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTplText.trim();
    if (!text) return;
    const label =
      newTplLabel.trim() ||
      (text.length > 20 ? `${text.slice(0, 20).trim()}…` : text);
    onAddTemplate({
      id: `tpl-${Date.now()}`,
      label,
      text,
    });
    setMessageBody(text);
    setNewTplLabel('');
    setNewTplText('');
    setShowAddTemplate(false);
    setValidationHint(null);
  };

  const applyTemplate = (tpl: QuickTemplate) => {
    setValidationHint(null);
    if (isMultiBatch && messageMode === 'custom') {
      setCustomMessages((prev) => {
        const next = { ...prev };
        for (const c of effectiveBatchContacts) {
          if (!next[c.id]?.trim()) {
            next[c.id] = tpl.text;
          }
        }
        return next;
      });
    } else {
      setMessageBody(tpl.text);
    }
  };

  const buildTask = (): ScheduledWhatsAppTask | null => {
    if (effectiveBatchContacts.length === 0) {
      if (recipientTab === 'groups') {
        if (contacts.length === 0) {
          setRecipientTab('contacts');
          setShowAddContact(true);
          setValidationHint('Add or import contacts first');
        } else {
          setShowCreateGroup(true);
          setValidationHint('Create or select a broadcast group');
        }
      } else {
        setShowAddContact(true);
        setValidationHint('Add or import a contact first');
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
        setValidationHint('Enter a message or tap a quick template');
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
      setValidationHint('Enter a broadcast message or tap a quick template');
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
    <div className="grid grid-cols-12 gap-2.5">
      {/* BENTO TILE 1 (12 cols): Contacts, Bulk Import & Broadcast Groups */}
      <section className="col-span-12 bento-card p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-ghost-elevated p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setRecipientTab('contacts');
                setValidationHint(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                recipientTab === 'contacts'
                  ? 'bg-ghost-accent text-ghost-accentInk shadow-neonSm'
                  : 'text-ghost-secondary hover:text-ghost-ink'
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
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                recipientTab === 'groups'
                  ? 'bg-ghost-accent text-ghost-accentInk shadow-neonSm'
                  : 'text-ghost-secondary hover:text-ghost-ink'
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
                    ? 'btn-solid px-2 py-1 text-[11px] rounded-lg'
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

            {recipientTab === 'contacts' ? (
              <button
                type="button"
                onClick={() => setShowAddContact((v) => !v)}
                className={
                  showAddContact
                    ? 'btn-solid px-2.5 py-1 text-[11px] rounded-lg'
                    : 'btn-outline px-2.5 py-1 text-[11px] rounded-lg'
                }
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreateGroup((v) => !v)}
                className={
                  showCreateGroup
                    ? 'btn-solid px-2.5 py-1 text-[11px] rounded-lg'
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
            {(showAddContact || sortedContacts.length === 0) && (
              <form
                onSubmit={handleSaveContact}
                className="p-2.5 bg-ghost-elevated/60 rounded-xl flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  placeholder="Contact name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bento-input flex-1 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="tel"
                  placeholder="+CountryCodeNumber"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="bento-input flex-1 px-2.5 py-1.5 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="btn-solid px-3.5 py-1.5 shrink-0 rounded-xl"
                >
                  Save
                </button>
              </form>
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
                  Import or add contacts first.
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
          <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary flex items-center gap-1">
            <Clock className="w-3 h-3 text-ghost-accent" /> Time
          </span>

          <div className="flex items-center gap-1">
            {(
              [
                { id: '1m', label: '+1m' },
                { id: '5m', label: '+5m' },
                { id: '9am', label: '9a' },
              ] as const
            ).map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => applyQuickTime(q.id)}
                className="px-1.5 py-0.5 rounded-md bg-ghost-elevated hover:bg-ghost-accent hover:text-ghost-accentInk text-[10px] font-mono font-semibold text-ghost-secondary transition"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
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
              className="appearance-none bento-input px-2.5 py-2 font-mono text-xl font-bold text-center cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
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
                updateTimeParts(
                  parsedTime.h12,
                  Number(e.target.value),
                  parsedTime.period
                )
              }
              className="appearance-none bento-input px-2.5 py-2 font-mono text-xl font-bold text-center cursor-pointer"
            >
              {Array.from({ length: 60 }, (_, m) => m).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            {(['AM', 'PM'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  updateTimeParts(parsedTime.h12, parsedTime.min, p)
                }
                className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-bold border transition ${
                  parsedTime.period === p
                    ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent'
                    : 'bg-ghost-elevated text-ghost-secondary border-transparent'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
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
        <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary block">
          App
        </span>
        <div className="grid grid-cols-1 gap-2 my-auto">
          <button
            type="button"
            onClick={() => setWhatsappPackage('com.whatsapp')}
            className={
              whatsappPackage === 'com.whatsapp'
                ? 'btn-solid py-2.5 text-xs rounded-xl'
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
                ? 'btn-solid py-2.5 text-xs rounded-xl'
                : 'btn-outline py-2.5 text-xs rounded-xl'
            }
          >
            WA Business
          </button>
        </div>
      </section>

      {/* BENTO TILE 4 (12 cols): Custom Recurring Schedule Selector */}
      <section className="col-span-12 bento-card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary flex items-center gap-1 shrink-0">
            <Repeat className="w-3 h-3 text-ghost-accent" /> Schedule
          </span>

          <div className="flex items-center gap-1 overflow-x-auto">
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 ${
                  repeatMode === m.id
                    ? 'bg-ghost-accent text-ghost-accentInk shadow-neonSm'
                    : 'bg-ghost-elevated text-ghost-secondary hover:text-ghost-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
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

      {/* BENTO TILE 5 (12 cols): Quick Templates, Dynamic Variables & Composer */}
      <section className="col-span-12 bento-card p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
            Message
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleQuickSaveCurrentAsTemplate}
              className="btn-outline px-2 py-0.5 text-[10px] rounded-lg"
            >
              {templateSavedToast ? (
                <>
                  <Check className="w-3 h-3 text-ghost-accent" /> Saved
                </>
              ) : messageBody.trim() ? (
                <>
                  <BookmarkPlus className="w-3 h-3" /> Save Template
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3" /> Template
                </>
              )}
            </button>

            {isMultiBatch && (
              <div className="flex items-center gap-0.5 bg-ghost-elevated p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMessageMode('same')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                    messageMode === 'same'
                      ? 'bg-ghost-accent text-ghost-accentInk'
                      : 'text-ghost-secondary'
                  }`}
                >
                  Same
                </button>
                <button
                  type="button"
                  onClick={() => setMessageMode('custom')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                    messageMode === 'custom'
                      ? 'bg-ghost-accent text-ghost-accentInk'
                      : 'text-ghost-secondary'
                  }`}
                >
                  Per Person
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Variable Chips ({name}, {date}, {day}) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {DYNAMIC_TOKENS.map((tok) => (
            <button
              key={tok}
              type="button"
              onClick={() => insertDynamicToken(tok)}
              className="px-2 py-0.5 rounded-lg bg-ghost-elevated hover:bg-ghost-accent hover:text-ghost-accentInk text-[10px] font-mono font-bold text-ghost-secondary border border-ghost-border/20 dark:border-ghost-border transition"
            >
              + {tok}
            </button>
          ))}
        </div>

        {/* Inline Quick Template Creator */}
        {showAddTemplate && (
          <form
            onSubmit={handleSaveCustomTemplateForm}
            className="p-2 bg-ghost-elevated/60 rounded-xl flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              placeholder="Title (optional)"
              value={newTplLabel}
              onChange={(e) => setNewTplLabel(e.target.value)}
              className="bento-input sm:w-28 px-2.5 py-1.5 text-xs"
            />
            <input
              ref={templateInputRef}
              type="text"
              placeholder="Template text… e.g. Hi {name}"
              value={newTplText}
              onChange={(e) => setNewTplText(e.target.value)}
              className="bento-input flex-1 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="btn-solid px-3 py-1.5 rounded-xl shrink-0"
            >
              Add
            </button>
          </form>
        )}

        {/* Saved Quick Message Templates Strip */}
        {templates.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="inline-flex items-center rounded-lg bg-ghost-elevated border border-ghost-border/20 dark:border-ghost-border hover:border-ghost-accent shrink-0 transition"
              >
                <button
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-ghost-ink flex items-center gap-1"
                >
                  <Zap className="w-3 h-3 text-ghost-accent shrink-0" />
                  <span>{tpl.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteTemplate(tpl.id)}
                  aria-label="Delete template"
                  className="pr-2 pl-0.5 py-1 text-ghost-muted hover:text-ghost-ink"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

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

        <div className="grid grid-cols-5 gap-2 pt-0.5">
          <button
            type="button"
            onClick={handlePreview}
            className="col-span-2 btn-outline-accent py-2.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {nativeMode ? 'Send Now' : 'Test'}
          </button>

          <button
            type="button"
            onClick={handleSchedule}
            className="col-span-3 btn-solid py-2.5 shadow-neon"
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
                  ? `Schedule (${effectiveBatchContacts.length}) · ${formatTime12h(
                      time24
                    )}`
                  : `Schedule · ${formatTime12h(time24)}`}
              </>
            )}
          </button>
        </div>
      </section>

      {/* BULK IMPORT PHONE CONTACTS (MULTI-SELECT PICKER) MODAL */}
      {showBulkModal && (
        <div
          onClick={() => setShowBulkModal(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bento-card shadow-2xl p-4 flex flex-col gap-3 max-h-[85vh]"
          >
            <div className="flex items-center justify-between pb-2 border-b border-ghost-border/25 dark:border-ghost-border">
              <div>
                <div className="text-sm font-bold text-ghost-ink">
                  Bulk Import Contacts
                </div>
                <div className="text-[11px] text-ghost-muted">
                  Select multiple phone contacts at once
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="btn-outline p-1.5 rounded-lg"
                aria-label="Close bulk import"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bulkLoading ? (
              <div className="py-10 text-center text-xs font-mono text-ghost-secondary">
                Reading phone contacts…
              </div>
            ) : bulkCandidates.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="bento-input flex-1 px-2.5 py-1.5 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-ghost-muted shrink-0" />
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
                    className="btn-outline px-2.5 py-1.5 text-[11px] rounded-xl shrink-0"
                  >
                    Select All
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-[160px] max-h-[300px]">
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
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition ${
                          alreadySaved
                            ? 'bg-ghost-elevated/40 border-transparent opacity-55 cursor-default'
                            : checked
                              ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent'
                              : 'bg-ghost-elevated text-ghost-ink border-ghost-border/20 dark:border-ghost-border'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-7 h-7 rounded-lg font-mono text-[10px] font-bold flex items-center justify-center shrink-0 ${
                              checked
                                ? 'bg-ghost-accentInk/15 text-ghost-accentInk'
                                : 'bg-ghost-surface text-ghost-ink'
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
                          <span className="text-[10px] font-mono font-bold text-ghost-muted shrink-0">
                            Saved
                          </span>
                        ) : (
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              checked
                                ? 'bg-ghost-accentInk text-ghost-accent border-ghost-accentInk'
                                : 'border-ghost-muted/50'
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

            <div className="grid grid-cols-2 gap-2 pt-1">
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
                Import ({bulkSelectedPhones.length})
              </button>
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bento-card shadow-2xl p-4 space-y-3"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bento-card shadow-2xl p-4 space-y-3"
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
                  className="btn-solid w-full justify-start px-3 py-2.5"
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
