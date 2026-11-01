import React, { useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  BookUser,
  Calendar,
  Check,
  Clock,
  Layers,
  Pencil,
  Play,
  Plus,
  Repeat,
  Send,
  Star,
  Trash2,
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
  groups: ContactGroup[];
  templates: QuickTemplate[];
  onAddContact: (c: SavedContact) => void;
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

const LONG_PRESS_MS = 420;

export const CommandDeck: React.FC<CommandDeckProps> = ({
  contacts,
  groups,
  templates,
  onAddContact,
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

  // Schedule Time & App state
  const [time24, setTime24] = useState('09:00');
  const [dateStr, setDateStr] = useState(() => getTodayOrTomorrowDate('09:00'));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once');
  const [whatsappPackage, setWhatsappPackage] =
    useState<TargetWhatsApp>('com.whatsapp');
  const [scheduledToast, setScheduledToast] = useState(false);
  const [validationHint, setValidationHint] = useState<string | null>(null);

  // Add Contact inline form
  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+');

  // Create / Edit Broadcast Group inline/modal state
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

  // Effective recipients list across Single, Multi, or Broadcast Group
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

  const handlePickNativeContact = () => {
    const ok = launchNativeContactPicker((picked) => {
      onAddContact(picked);
      setSelectedContactId(picked.id);
      if (multiMode) {
        setSelectedMultiIds((prev) =>
          prev.includes(picked.id) ? prev : [...prev, picked.id]
        );
      }
      setValidationHint(null);
    });
    if (!ok) {
      setRecipientTab('contacts');
      setShowAddContact(true);
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
          setValidationHint('Add a contact first to schedule messages');
        } else {
          setShowCreateGroup(true);
          setValidationHint('Create or select a broadcast group');
        }
      } else {
        setShowAddContact(true);
        setValidationHint('Add a contact first');
      }
      return null;
    }

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
        scheduledDate: dateStr,
        triggerAtMillis: computeTriggerMillis(dateStr, time24),
        repeatMode,
        whatsappPackage,
        enabled: true,
      };
    }

    // Multi-Contact or Broadcast Group
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
      {/* BENTO TILE 1 (12 cols): Contacts & Broadcast Groups */}
      <section className="col-span-12 bento-card p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Contacts vs Broadcast Groups Switcher */}
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

          {/* Right Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {recipientTab === 'contacts' && sortedContacts.length > 1 && (
              <button
                type="button"
                onClick={toggleMultiMode}
                className={
                  multiMode
                    ? 'btn-solid px-2.5 py-1 text-[11px] rounded-lg'
                    : 'btn-outline px-2.5 py-1 text-[11px] rounded-lg'
                }
              >
                <Users className="w-3 h-3" />
                Multi
              </button>
            )}

            {recipientTab === 'contacts' && nativeMode && (
              <button
                type="button"
                onClick={handlePickNativeContact}
                className="btn-outline px-2.5 py-1 text-[11px] rounded-lg"
              >
                <BookUser className="w-3 h-3" />
                Book
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
              <div className="grid grid-cols-2 gap-2">
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
                  Save contacts first to build a broadcast list.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRecipientTab('contacts');
                    setShowAddContact(true);
                  }}
                  className="btn-solid px-3 py-1.5 rounded-lg shrink-0"
                >
                  Add Contact
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

                    <div className="flex flex-wrap gap-1.5">
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
            disabled={repeatMode === 'daily'}
            className="w-full bg-transparent text-[11px] font-mono font-medium text-ghost-ink focus:outline-none disabled:opacity-40"
          />
        </div>
      </section>

      {/* BENTO TILE 3 (5 cols): App Target + Repeat Bento Tile */}
      <section className="col-span-5 bento-card p-3.5 flex flex-col justify-between gap-2.5">
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary block">
            App
          </span>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => setWhatsappPackage('com.whatsapp')}
              className={
                whatsappPackage === 'com.whatsapp'
                  ? 'btn-solid py-1.5 text-[11px] rounded-lg'
                  : 'btn-outline py-1.5 text-[11px] rounded-lg'
              }
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setWhatsappPackage('com.whatsapp.w4b')}
              className={
                whatsappPackage === 'com.whatsapp.w4b'
                  ? 'btn-solid py-1.5 text-[11px] rounded-lg'
                  : 'btn-outline py-1.5 text-[11px] rounded-lg'
              }
            >
              WA Business
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setRepeatMode((m) => (m === 'once' ? 'daily' : 'once'))
          }
          className={
            repeatMode === 'daily'
              ? 'btn-solid py-2 text-[11px] rounded-xl w-full'
              : 'btn-outline py-2 text-[11px] rounded-xl w-full'
          }
        >
          <Repeat className="w-3 h-3" />
          {repeatMode === 'daily' ? 'Daily' : 'Once'}
        </button>
      </section>

      {/* BENTO TILE 4 (12 cols): Quick Templates + Message Composer & Dispatch */}
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
              type="text"
              placeholder="Template text…"
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
                ? `Broadcast message to ${activeGroup.name}…`
                : isMultiBatch
                  ? `Message for ${effectiveBatchContacts.length} contacts…`
                  : 'Write message…'
            }
            className="bento-input w-full px-3 py-2.5 text-sm font-medium placeholder:text-ghost-muted resize-none"
          />
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
