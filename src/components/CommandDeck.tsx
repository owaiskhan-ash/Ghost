import React, { useMemo, useState } from 'react';
import {
  Check,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import type {
  AndroidDeviceStatus,
  ContactProfile,
  ExecutionMode,
  GhostTask,
} from '../types/ghost';
import {
  computeJitteredDisplayTime,
  parseNaturalCommand,
} from '../engine/intentParser';
import { PROMPT_PRESETS } from '../data/seedData';

interface CommandDeckProps {
  contacts: ContactProfile[];
  deviceStatus: AndroidDeviceStatus;
  onAddContact: (c: ContactProfile) => void;
  onArmTask: (task: GhostTask) => void;
  onDryRunTask: (task: GhostTask, contact: ContactProfile) => void;
}

export const CommandDeck: React.FC<CommandDeckProps> = ({
  contacts,
  onAddContact,
  onArmTask,
  onDryRunTask,
}) => {
  const [prompt, setPrompt] = useState(
    'please msg jasmine at 5 am Good morning'
  );
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [jitterMinutes, setJitterMinutes] = useState<number>(4);
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>('hybrid_dual');
  const [contextGuardEnabled, setContextGuardEnabled] = useState<boolean>(true);
  const [useToneMatch, setUseToneMatch] = useState<boolean>(false);
  const [customMessageOverride, setCustomMessageOverride] = useState<
    string | null
  >(null);
  const [showOptions, setShowOptions] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const [showAddContact, setShowAddContact] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+91');

  const parsed = useMemo(
    () => parseNaturalCommand(prompt, contacts),
    [prompt, contacts]
  );

  const activeContact: ContactProfile = useMemo(() => {
    const found = parsed.matchedContacts.find(
      (c) => c.id === selectedContactId
    );
    return found || parsed.matchedContacts[0] || contacts[0];
  }, [parsed.matchedContacts, selectedContactId, contacts]);

  const finalMessage = useMemo(() => {
    if (customMessageOverride !== null) return customMessageOverride;
    if (useToneMatch && parsed.triggerType !== 'cross_app_chain') {
      return activeContact.toneSample;
    }
    return parsed.messageBody;
  }, [
    customMessageOverride,
    useToneMatch,
    parsed.messageBody,
    parsed.triggerType,
    activeContact,
  ]);

  const effectiveTime = useMemo(() => {
    if (parsed.triggerType === 'alarm_dismissed') return 'Alarm + 5m';
    return computeJitteredDisplayTime(parsed.scheduledTime24, jitterMinutes, 3);
  }, [parsed.scheduledTime24, parsed.triggerType, jitterMinutes]);

  const buildDraftTask = (): GhostTask => ({
    id: `task-${Date.now()}`,
    rawPrompt: parsed.rawPrompt,
    contactId: activeContact.id,
    contactName: activeContact.name,
    contactPhone: activeContact.phone,
    targetApp:
      parsed.targetApp === 'Cross-App Chain'
        ? 'Cross-App Chain'
        : activeContact.whatsappPackage === 'com.whatsapp.w4b'
          ? 'WhatsApp Business'
          : 'WhatsApp',
    messageBody: finalMessage,
    scheduledTime24: parsed.scheduledTime24,
    displayTime: parsed.displayTime,
    jitterMinutes,
    effectiveTime,
    triggerType: parsed.triggerType,
    triggerLabel: parsed.triggerLabel,
    executionMode,
    contextGuardEnabled,
    toneMatched: useToneMatch,
    conditionalRule: parsed.conditionalRule,
    chainSteps: parsed.chainSteps,
    enabled: true,
    createdAt: 'Active',
  });

  const handleArm = () => {
    onArmTask(buildDraftTask());
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2400);
  };

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    const cleanPhone = newPhone.replace(/\s+/g, '');
    const initials = newName
      .trim()
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const created: ContactProfile = {
      id: `c-custom-${Date.now()}`,
      name: newName.trim(),
      tag: 'Mobile',
      phone: cleanPhone,
      maskedPhone: cleanPhone.slice(-4),
      relationship: 'personal',
      avatarInitials: initials || 'CT',
      preferredTone: 'Casual',
      toneSample: `good morning ${newName.trim().split(' ')[0].toLowerCase()} ☀️`,
      whatsappPackage: 'com.whatsapp',
      recentMessagesNormal: [
        { id: 'cm1', sender: 'them', text: 'Talk tomorrow!', time: '10:15 PM' },
      ],
      recentMessagesEmergency: [
        {
          id: 'cm2',
          sender: 'them',
          text: 'Emergency tonight—sleeping late, don’t text early.',
          time: '02:14 AM',
          isUrgentKeyword: true,
        },
      ],
    };
    onAddContact(created);
    setSelectedContactId(created.id);
    setNewName('');
    setNewPhone('+91');
    setShowAddContact(false);
  };

  return (
    <div className="space-y-4 pb-4">
      {/* 1. Clean Command Box */}
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-3">
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setCustomMessageOverride(null);
          }}
          placeholder="Message Jasmine at 5 am Good morning"
          className="w-full rounded-2xl bg-white border border-ghost-border focus:border-ghost-red focus:outline-none px-3.5 py-3 text-[15px] font-medium text-ghost-ink placeholder:text-ghost-muted resize-none transition leading-snug"
        />

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {PROMPT_PRESETS.map((preset) => {
            const active =
              prompt.trim().toLowerCase() === preset.prompt.toLowerCase();
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPrompt(preset.prompt);
                  setCustomMessageOverride(null);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  active
                    ? 'bg-ghost-red text-white'
                    : 'bg-ghost-recessed text-ghost-secondary hover:text-ghost-ink'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Minimal Action Preview Card */}
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-4">
        {/* Time & App Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ghost-red neon-pulse" />
            <span className="text-sm font-semibold text-ghost-ink">
              {parsed.targetApp}
            </span>
          </div>
          <span className="font-mono text-sm font-bold text-ghost-red bg-ghost-redSoft px-3 py-1 rounded-full">
            {effectiveTime}
          </span>
        </div>

        {/* Contact Picker Pills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ghost-muted">To</span>
            <button
              type="button"
              onClick={() => setShowAddContact((v) => !v)}
              className="text-xs font-medium text-ghost-red flex items-center gap-0.5"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>

          {showAddContact && (
            <form
              onSubmit={handleCreateContact}
              className="p-2.5 rounded-2xl bg-ghost-recessed flex gap-2"
            >
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-1/2 rounded-xl bg-white px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <input
                type="tel"
                placeholder="+91..."
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-1/2 rounded-xl bg-white px-2.5 py-1.5 text-xs font-mono focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 rounded-xl bg-ghost-red text-white text-xs font-semibold shrink-0"
              >
                Add
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-1.5">
            {parsed.matchedContacts.map((c) => {
              const isSelected = c.id === activeContact.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedContactId(c.id)}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-semibold transition flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-ghost-red text-white border-ghost-red shadow-neonSm'
                      : 'bg-white text-ghost-ink border-ghost-border hover:border-ghost-borderStrong'
                  }`}
                >
                  <span>{c.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-ghost-recessed text-ghost-secondary'
                    }`}
                  >
                    {c.tag}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Bubble Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ghost-muted">
              Message
            </span>
            {parsed.triggerType !== 'cross_app_chain' && (
              <button
                type="button"
                onClick={() => {
                  setCustomMessageOverride(null);
                  setUseToneMatch((v) => !v);
                }}
                className={`text-xs font-medium flex items-center gap-1 transition ${
                  useToneMatch ? 'text-ghost-red font-semibold' : 'text-ghost-secondary'
                }`}
              >
                <Sparkles className="w-3 h-3 text-ghost-red" />
                {useToneMatch ? 'My tone' : 'Match tone'}
              </button>
            )}
          </div>
          <input
            type="text"
            value={finalMessage}
            onChange={(e) => setCustomMessageOverride(e.target.value)}
            className="w-full rounded-2xl bg-white border border-ghost-border focus:border-ghost-red focus:outline-none px-3.5 py-2.5 text-sm font-medium text-ghost-ink"
          />
        </div>

        {/* Quiet Collapsible Options Toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="text-xs font-medium text-ghost-secondary hover:text-ghost-ink flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-ghost-red" />
            <span>
              {contextGuardEnabled ? 'Smart check on' : 'Smart check off'} · ±
              {jitterMinutes}m ·{' '}
              {executionMode === 'hybrid_dual'
                ? 'Dual mode'
                : executionMode === 'headless_linked'
                  ? 'Lock-safe'
                  : 'Screen wake'}
            </span>
          </button>

          {showOptions && (
            <div className="mt-3 pt-3 border-t border-ghost-border space-y-3">
              {/* Smart Read Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ghost-ink">
                  Check recent messages first
                </span>
                <button
                  type="button"
                  onClick={() => setContextGuardEnabled((v) => !v)}
                  className={`w-10 h-5.5 rounded-full p-0.5 transition flex items-center ${
                    contextGuardEnabled
                      ? 'bg-ghost-red justify-end'
                      : 'bg-ghost-borderStrong justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow" />
                </button>
              </div>

              {/* Natural Jitter */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ghost-ink">
                    Natural timing
                  </span>
                  <span className="font-mono text-ghost-red font-semibold">
                    ±{jitterMinutes}m
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={jitterMinutes}
                  onChange={(e) => setJitterMinutes(Number(e.target.value))}
                  className="w-full ghost-slider"
                />
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'hybrid_dual', label: 'Dual' },
                    { id: 'headless_linked', label: 'Lock-Safe' },
                    { id: 'screen_wake', label: 'Screen' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExecutionMode(m.id)}
                    className={`py-1.5 rounded-xl text-xs font-semibold transition ${
                      executionMode === m.id
                        ? 'bg-ghost-red text-white'
                        : 'bg-ghost-recessed text-ghost-secondary'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Clean Two-Button Action Row */}
        <div className="grid grid-cols-5 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onDryRunTask(buildDraftTask(), activeContact)}
            className="col-span-2 py-3 rounded-2xl bg-ghost-recessed hover:bg-ghost-border text-ghost-ink font-semibold text-xs transition flex items-center justify-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 text-ghost-red fill-current" />
            Preview
          </button>

          <button
            type="button"
            onClick={handleArm}
            className="col-span-3 py-3 rounded-2xl bg-ghost-red hover:bg-ghost-redHover text-white font-bold text-xs shadow-neon transition flex items-center justify-center gap-1.5"
          >
            {savedToast ? (
              <>
                <Check className="w-4 h-4" />
                Scheduled
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current" />
                Schedule · {effectiveTime}
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};
