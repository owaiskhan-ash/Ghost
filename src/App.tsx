import { useEffect, useLayoutEffect, useState } from 'react';
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
  computeNextTaskTrigger,
  EMPTY_CONTACTS,
  EMPTY_GROUPS,
  EMPTY_HISTORY,
  EMPTY_TASKS,
  EMPTY_TEMPLATES,
  makeInitials,
} from './data/seedData';
import {
  cancelNativeAlarmTask,
  clearAllPhoneCache,
  executeNativeTaskNow,
  getAndroidDeviceStatus,
  isRunningInNativeApk,
  loadFromPhoneCache,
  loadNativeReceipts,
  loadNativeTaskStates,
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
import ghostLogoLight from './assets/ghost-header-logo-light.png';
import ghostLogoDark from './assets/ghost-header-logo-dark.png';

type ActiveTab = 'new' | 'scheduled' | 'settings';

const CACHE_KEYS = {
  contacts: 'ghost_cache_v5_contacts',
  groups: 'ghost_cache_v5_groups',
  templates: 'ghost_cache_v5_templates',
  tasks: 'ghost_cache_v5_tasks',
  history: 'ghost_cache_v5_history',
  darkMode: 'ghost_cache_v5_dark_mode',
};

purgeLegacyDummyStorage();

function normalizeDigits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

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

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', darkMode ? '#252A30' : '#E0E5EC');
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

  // Sync device permissions, background closed-app task updates & native receipts
  useEffect(() => {
    const syncNativeState = () => {
      setDeviceStatus(getAndroidDeviceStatus());
      if (!nativeMode) return;

      const nativeTaskStates = loadNativeTaskStates();
      if (nativeTaskStates.length > 0) {
        const stateById = new Map(nativeTaskStates.map((s) => [s.id, s]));
        setTasks((prev) =>
          prev.map((t) => {
            const ns = stateById.get(t.id);
            if (!ns) return t;
            return {
              ...t,
              enabled: Boolean(ns.enabled),
              scheduledDate: ns.scheduledDate || t.scheduledDate,
              triggerAtMillis: ns.triggerAtMillis || t.triggerAtMillis,
            };
          })
        );
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
    const onReturnToApp = () => syncNativeState();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onReturnToApp);
    window.addEventListener('pageshow', onReturnToApp);
    window.addEventListener('ghost:device-status-changed', onReturnToApp);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onReturnToApp);
      window.removeEventListener('pageshow', onReturnToApp);
      window.removeEventListener('ghost:device-status-changed', onReturnToApp);
    };
  }, [nativeMode]);

  // Permission settings are managed by Android outside the WebView. Poll only
  // while this screen is open so delayed OEM permission updates settle visibly.
  useEffect(() => {
    if (!nativeMode || activeTab !== 'settings') return;

    const refreshPermissionState = () => {
      setDeviceStatus(getAndroidDeviceStatus());
    };
    refreshPermissionState();
    const id = window.setInterval(refreshPermissionState, 1500);
    return () => window.clearInterval(id);
  }, [activeTab, nativeMode]);

  const handleBulkAddContacts = (items: SavedContact[]) => {
    if (items.length === 0) return;
    setContacts((prev) => {
      const seen = new Set(prev.map((p) => normalizeDigits(p.phone)));
      const fresh: SavedContact[] = [];
      for (const item of items) {
        const key = normalizeDigits(item.phone);
        if (key && !seen.has(key)) {
          seen.add(key);
          fresh.push(item);
        }
      }
      return fresh.length > 0 ? [...fresh, ...prev] : prev;
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

  const handleScheduleTask = (task: ScheduledWhatsAppTask) => {
    scheduleNativeAlarmTask(task);
    setTasks((prev) => [task, ...prev]);
  };

  const resumeTaskCleanly = (
    task: ScheduledWhatsAppTask
  ): ScheduledWhatsAppTask => {
    const next = computeNextTaskTrigger({
      scheduledDate: task.scheduledDate,
      scheduledTime24: task.scheduledTime24,
      repeatMode: task.repeatMode,
      repeatDays: task.repeatDays,
      repeatMonthDay: task.repeatMonthDay,
      repeatIntervalDays: task.repeatIntervalDays,
    });

    const resumed: ScheduledWhatsAppTask = {
      ...task,
      enabled: true,
      scheduledDate: next.nextDateStr,
      triggerAtMillis: next.triggerAtMillis,
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
    <div className="soft-app relative flex flex-col h-full bg-ghost-canvas text-ghost-ink">
      {!nativeMode && (
        <div className="hidden sm:flex px-6 pt-3 items-center justify-between text-[10px] font-medium text-ghost-secondary shrink-0">
          <span>{statusClock}</span>
          <div className="w-14 h-2.5 rounded-full soft-pill !min-h-0 !p-0" />
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3 h-3" />
            <span className="status-dot" />
          </div>
        </div>
      )}

      {/* Header and workspace share one scroll surface. */}
      <main className="soft-main flex-1 overflow-y-auto">
        <header className="soft-header">
          <div className="soft-header-brand">
            <div
              className="soft-icon-well soft-header-logo-well"
              aria-hidden="true"
            >
              <img
                src={darkMode ? ghostLogoDark : ghostLogoLight}
                alt=""
                className="soft-header-logo"
                draggable={false}
              />
            </div>
            <div className="min-w-0">
              <div className="brand-wordmark">Ghost</div>
              <div className="text-[10px] text-ghost-muted mt-0.5">
                WhatsApp scheduler
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('scheduled')}
              className="soft-status-pill"
            >
              <span className="status-dot" />
              {activeCount} active
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Toggle saved theme preference"
              className="soft-round-button"
            >
              {darkMode ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>

        <div className="soft-main-content">
          {activeTab === 'new' && (
            <CommandDeck
              contacts={contacts}
              groups={groups}
              onBulkAddContacts={handleBulkAddContacts}
              onToggleFavouriteContact={handleToggleFavouriteContact}
              onEditContact={handleEditContact}
              onDeleteContact={handleDeleteContact}
              onSaveGroup={handleSaveGroup}
              onDeleteGroup={handleDeleteGroup}
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
                tasks: tasks.length,
                history: history.length,
              }}
              onClearPhoneCache={handleClearPhoneCache}
            />
          )}
        </div>
      </main>

      {/* Floating raised navigation pill */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <nav aria-label="Primary" className="soft-dock pointer-events-auto">
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
                className={`soft-nav-item ${isActive ? 'is-active' : ''}`}
              >
                <Icon />
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
      <div className="soft-shell h-screen w-screen overflow-hidden">
        {androidAppContent}
      </div>
    );
  }

  return (
    <div className="soft-shell min-h-screen flex items-center justify-center sm:p-7">
      <div className="relative flex items-start w-full sm:w-auto min-h-screen sm:min-h-0">
        <div className="soft-phone-frame w-full sm:w-[404px] h-screen sm:h-[790px] sm:max-h-[91vh] rounded-none sm:rounded-[38px] overflow-hidden flex flex-col">
          {androidAppContent}
        </div>

        {/* Simulated Volume-Down hardware stop key on desktop */}
        <div className="hidden sm:flex flex-col gap-2.5 mt-28">
          <div className="w-1 h-9 rounded-r bg-ghost-secondary/60" />
          <div className="w-1 h-11 rounded-r bg-ghost-secondary/60 mt-2" />
          <button
            type="button"
            onClick={() => setHardwareKillSignal((s) => s + 1)}
            className="w-2 h-12 rounded-r bg-[#D97A7A] hover:w-3 transition-all cursor-pointer"
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
