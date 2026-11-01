import { useEffect, useState } from 'react';
import {
  Clock,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
  Wifi,
} from 'lucide-react';
import type {
  AndroidDeviceStatus,
  ContactGroup,
  QuickTemplate,
  SavedContact,
  ScheduledWhatsAppTask,
  SentHistoryItem,
} from './types/ghost';
import {
  computeTriggerMillis,
  EMPTY_CONTACTS,
  EMPTY_GROUPS,
  EMPTY_HISTORY,
  EMPTY_TASKS,
  EMPTY_TEMPLATES,
  getTodayOrTomorrowDate,
  makeInitials,
} from './data/seedData';
import {
  cancelNativeAlarmTask,
  clearAllPhoneCache,
  executeNativeTaskNow,
  getAndroidDeviceStatus,
  isRunningInNativeApk,
  loadFromPhoneCache,
  loadNativeContactsList,
  loadNativeReceipts,
  pauseNativeAlarmTask,
  purgeLegacyDummyStorage,
  saveToPhoneCache,
  scheduleNativeAlarmTask,
  syncNativeDarkMode,
} from './bridge/nativeBridge';
import { CommandDeck } from './components/CommandDeck';
import { QueueView } from './components/QueueView';
import { SetupView } from './components/SetupView';
import { LiveScreenStage } from './components/LiveScreenStage';

type ActiveTab = 'new' | 'scheduled' | 'settings';

const CACHE_KEYS = {
  contacts: 'ghost_cache_v5_contacts',
  groups: 'ghost_cache_v5_groups',
  templates: 'ghost_cache_v5_templates',
  tasks: 'ghost_cache_v5_tasks',
  history: 'ghost_cache_v5_history',
  darkMode: 'ghost_cache_v5_dark_mode',
};

// Purge any legacy v1-v4 dummy seed keys immediately before state initialization
purgeLegacyDummyStorage();

export function App() {
  const nativeMode = isRunningInNativeApk();

  const [activeTab, setActiveTab] = useState<ActiveTab>('new');
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    loadFromPhoneCache(CACHE_KEYS.darkMode, true)
  );

  const [contacts, setContacts] = useState<SavedContact[]>(() =>
    loadFromPhoneCache(CACHE_KEYS.contacts, EMPTY_CONTACTS)
  );
  const [groups, setGroups] = useState<ContactGroup[]>(() =>
    loadFromPhoneCache(CACHE_KEYS.groups, EMPTY_GROUPS)
  );
  const [templates, setTemplates] = useState<QuickTemplate[]>(() =>
    loadFromPhoneCache(CACHE_KEYS.templates, EMPTY_TEMPLATES)
  );
  const [tasks, setTasks] = useState<ScheduledWhatsAppTask[]>(() =>
    loadFromPhoneCache(CACHE_KEYS.tasks, EMPTY_TASKS)
  );
  const [history, setHistory] = useState<SentHistoryItem[]>(() =>
    loadFromPhoneCache(CACHE_KEYS.history, EMPTY_HISTORY)
  );

  const [deviceStatus, setDeviceStatus] = useState<AndroidDeviceStatus>(() =>
    getAndroidDeviceStatus()
  );

  const [previewTask, setPreviewTask] =
    useState<ScheduledWhatsAppTask | null>(null);
  const [hardwareKillSignal, setHardwareKillSignal] = useState(0);
  const [statusClock, setStatusClock] = useState('09:00');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    syncNativeDarkMode(darkMode);
    saveToPhoneCache(CACHE_KEYS.darkMode, darkMode);
  }, [darkMode]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setStatusClock(
        `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}`
      );
    };
    updateClock();
    const id = setInterval(updateClock, 15000);
    return () => clearInterval(id);
  }, []);

  // Persist every state slice into Phone Cache (Android SharedPreferences + localStorage)
  useEffect(() => {
    saveToPhoneCache(CACHE_KEYS.contacts, contacts);
  }, [contacts]);

  useEffect(() => {
    saveToPhoneCache(CACHE_KEYS.groups, groups);
  }, [groups]);

  useEffect(() => {
    saveToPhoneCache(CACHE_KEYS.templates, templates);
  }, [templates]);

  useEffect(() => {
    saveToPhoneCache(CACHE_KEYS.tasks, tasks);
  }, [tasks]);

  useEffect(() => {
    saveToPhoneCache(CACHE_KEYS.history, history);
  }, [history]);

  // Sync device contacts & native background delivery receipts
  useEffect(() => {
    const syncNativeState = () => {
      setDeviceStatus(getAndroidDeviceStatus());
      if (!nativeMode) return;

      const devContacts = loadNativeContactsList();
      if (devContacts.length > 0) {
        setContacts((prev) => {
          const existingPhones = new Set(prev.map((p) => p.phone));
          const merged = [...prev];
          for (const dc of devContacts) {
            if (!existingPhones.has(dc.phone)) {
              merged.push(dc);
            }
          }
          return merged;
        });
      }

      const nativeRcpts = loadNativeReceipts();
      if (nativeRcpts.length > 0) {
        setHistory((prev) => {
          const seenIds = new Set(prev.map((h) => h.id));
          const fresh = nativeRcpts.filter((r) => !seenIds.has(r.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      }
    };

    syncNativeState();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        syncNativeState();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [nativeMode]);

  const handleAddContact = (c: SavedContact) => {
    setContacts((prev) => {
      const withoutDup = prev.filter((item) => item.phone !== c.phone);
      return [c, ...withoutDup];
    });
  };

  const handleToggleFavouriteContact = (id: string) => {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, isFavourite: !c.isFavourite } : c
      )
    );
  };

  const handleEditContact = (id: string, name: string, phone: string) => {
    const initials = makeInitials(name);
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name, phone, initials } : c))
    );
    setTasks((prev) =>
      prev.map((t) => {
        const matchesPrimary = t.contactId === id;
        const matchesBatch = t.recipients?.some((r) => r.contactId === id);
        if (!matchesPrimary && !matchesBatch) return t;

        const updatedRecipients = t.recipients?.map((r) =>
          r.contactId === id
            ? {
                ...r,
                contactName: name,
                contactPhone: phone,
                contactInitials: initials,
              }
            : r
        );

        let updatedName = t.contactName;
        if (t.groupName && updatedRecipients) {
          updatedName = `${t.groupName} (${updatedRecipients.length})`;
        } else if (updatedRecipients && updatedRecipients.length > 1) {
          updatedName =
            updatedRecipients.length === 2
              ? `${updatedRecipients[0].contactName} & ${updatedRecipients[1].contactName}`
              : `${updatedRecipients[0].contactName}, ${
                  updatedRecipients[1].contactName
                } +${updatedRecipients.length - 2}`;
        } else if (matchesPrimary) {
          updatedName = name;
        }

        const updatedTask: ScheduledWhatsAppTask = {
          ...t,
          contactName: updatedName,
          contactPhone: matchesPrimary ? phone : t.contactPhone,
          contactInitials:
            updatedRecipients && updatedRecipients.length > 1
              ? t.contactInitials
              : matchesPrimary
                ? initials
                : t.contactInitials,
          recipients: updatedRecipients,
        };
        if (updatedTask.enabled) {
          scheduleNativeAlarmTask(updatedTask);
        }
        return updatedTask;
      })
    );
  };

  const handleDeleteContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    // Also prune deleted contact from any broadcast groups
    setGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          memberIds: g.memberIds.filter((mId) => mId !== id),
        }))
        .filter((g) => g.memberIds.length > 0)
    );
  };

  const handleSaveGroup = (group: ContactGroup) => {
    setGroups((prev) => {
      const exists = prev.some((g) => g.id === group.id);
      if (exists) {
        return prev.map((g) => (g.id === group.id ? group : g));
      }
      return [group, ...prev];
    });
  };

  const handleDeleteGroup = (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const handleAddTemplate = (tpl: QuickTemplate) => {
    setTemplates((prev) => [tpl, ...prev]);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleScheduleTask = (task: ScheduledWhatsAppTask) => {
    scheduleNativeAlarmTask(task);
    setTasks((prev) => [task, ...prev]);
  };

  const resumeTaskCleanly = (
    task: ScheduledWhatsAppTask
  ): ScheduledWhatsAppTask => {
    let nextDate = task.scheduledDate;
    let nextTrigger = computeTriggerMillis(nextDate, task.scheduledTime24);
    if (task.repeatMode === 'once') {
      const [yyyy, mm, dd] = nextDate.split('-').map(Number);
      const [hh, min] = task.scheduledTime24.split(':').map(Number);
      const candidate = new Date(
        yyyy || new Date().getFullYear(),
        (mm || 1) - 1,
        dd || 1,
        hh || 0,
        min || 0,
        0,
        0
      );
      if (candidate.getTime() <= Date.now()) {
        nextDate = getTodayOrTomorrowDate(task.scheduledTime24);
        nextTrigger = computeTriggerMillis(nextDate, task.scheduledTime24);
      }
    }
    const resumed: ScheduledWhatsAppTask = {
      ...task,
      enabled: true,
      scheduledDate: nextDate,
      triggerAtMillis: nextTrigger,
    };
    scheduleNativeAlarmTask(resumed);
    return resumed;
  };

  const handlePauseOrResumeTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.enabled) {
          pauseNativeAlarmTask(t.id);
          return { ...t, enabled: false };
        }
        return resumeTaskCleanly(t);
      })
    );
  };

  const handlePauseOrResumeAll = (pauseAll: boolean) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (pauseAll) {
          if (t.enabled) pauseNativeAlarmTask(t.id);
          return { ...t, enabled: false };
        }
        return t.enabled ? t : resumeTaskCleanly(t);
      })
    );
  };

  const handleDeleteTask = (id: string) => {
    cancelNativeAlarmTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleRunOrPreview = (task: ScheduledWhatsAppTask) => {
    if (nativeMode) {
      executeNativeTaskNow(task);
    } else {
      setPreviewTask(task);
    }
  };

  const handleClearPhoneCache = () => {
    for (const t of tasks) {
      cancelNativeAlarmTask(t.id);
    }
    clearAllPhoneCache(Object.values(CACHE_KEYS));
    setContacts([]);
    setGroups([]);
    setTemplates([]);
    setTasks([]);
    setHistory([]);
  };

  const activeCount = tasks.filter((t) => t.enabled).length;

  const androidAppContent = (
    <div className="relative flex flex-col h-full bg-ghost-canvas text-ghost-ink">
      {!nativeMode && (
        <div className="hidden sm:flex px-5 pt-3 pb-1 items-center justify-between text-[11px] font-mono font-medium text-ghost-secondary shrink-0">
          <span>{statusClock}</span>
          <div className="w-16 h-3.5 rounded-full bg-ghost-ink/15 dark:bg-white/10" />
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3 h-3" />
            <div className="w-4 h-2 rounded-sm bg-ghost-accent" />
          </div>
        </div>
      )}

      {/* Clean Minimal Header */}
      <header className="px-4 pt-3 pb-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-ghost-accent neon-pulse" />
          <span className="font-bold tracking-tight text-base text-ghost-ink">
            Ghost
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('scheduled')}
            className="btn-outline px-2.5 py-1 text-[11px] font-mono rounded-full"
          >
            {activeCount} active
          </button>
          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            aria-label="Toggle theme"
            className="btn-outline p-1.5 rounded-full"
          >
            {darkMode ? (
              <Sun className="w-3.5 h-3.5" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* Main Scrollable Bento Workspace (padded bottom for Floating Dock) */}
      <main className="flex-1 overflow-y-auto px-3.5 pb-24">
        {activeTab === 'new' && (
          <CommandDeck
            contacts={contacts}
            groups={groups}
            templates={templates}
            onAddContact={handleAddContact}
            onToggleFavouriteContact={handleToggleFavouriteContact}
            onEditContact={handleEditContact}
            onDeleteContact={handleDeleteContact}
            onSaveGroup={handleSaveGroup}
            onDeleteGroup={handleDeleteGroup}
            onAddTemplate={handleAddTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onScheduleTask={handleScheduleTask}
            onPreviewOrSendNow={handleRunOrPreview}
          />
        )}

        {activeTab === 'scheduled' && (
          <QueueView
            tasks={tasks}
            history={history}
            onPauseOrResumeTask={handlePauseOrResumeTask}
            onPauseOrResumeAll={handlePauseOrResumeAll}
            onDeleteTask={handleDeleteTask}
            onRunTask={handleRunOrPreview}
          />
        )}

        {activeTab === 'settings' && (
          <SetupView
            deviceStatus={deviceStatus}
            darkMode={darkMode}
            onToggleDarkMode={setDarkMode}
            cacheCounts={{
              contacts: contacts.length,
              groups: groups.length,
              templates: templates.length,
              tasks: tasks.length,
              history: history.length,
            }}
            onClearPhoneCache={handleClearPhoneCache}
          />
        )}
      </main>

      {/* Floating Dock */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-30 flex justify-center px-4">
        <nav
          aria-label="Primary"
          className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-ghost-surface/90 backdrop-blur-xl border border-ghost-border/35 dark:border-ghost-borderStrong shadow-dock"
        >
          {(
            [
              { id: 'new', label: 'New', icon: Plus },
              { id: 'scheduled', label: 'Queue', icon: Clock },
              { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl flex items-center gap-1.5 text-xs transition ${
                  isActive
                    ? 'bg-ghost-accent text-ghost-accentInk font-bold shadow-neonSm'
                    : 'text-ghost-secondary hover:text-ghost-ink font-semibold'
                }`}
              >
                <Icon className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );

  if (nativeMode) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-ghost-canvas">
        {androidAppContent}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ghost-canvas text-ghost-ink sm:p-5">
      <div className="relative flex items-start w-full sm:w-auto min-h-screen sm:min-h-0">
        <div className="w-full sm:w-[404px] h-screen sm:h-[790px] sm:max-h-[91vh] bg-ghost-canvas sm:border-[1.5px] sm:border-ghost-border/35 dark:sm:border-ghost-borderStrong rounded-none sm:rounded-[34px] sm:shadow-2xl overflow-hidden flex flex-col">
          {androidAppContent}
        </div>

        {/* Simulated Volume-Down Hardware Stop Key on Desktop */}
        <div className="hidden sm:flex flex-col gap-2.5 mt-28">
          <div className="w-1 h-9 rounded-r bg-ghost-borderStrong/50" />
          <div className="w-1 h-11 rounded-r bg-ghost-borderStrong/50 mt-2" />
          <button
            type="button"
            onClick={() => setHardwareKillSignal((s) => s + 1)}
            className="w-2 h-12 rounded-r bg-ghost-accent hover:w-3 transition-all shadow-neonSm cursor-pointer"
            title="Volume-Down Stop Key"
          />
        </div>
      </div>

      {previewTask && (
        <LiveScreenStage
          task={previewTask}
          onClose={() => setPreviewTask(null)}
          onHistoryAdded={(item) => setHistory((prev) => [item, ...prev])}
          externalKillSignal={hardwareKillSignal}
        />
      )}
    </div>
  );
}

export default App;
