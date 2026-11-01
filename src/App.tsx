import { useEffect, useState } from 'react';
import { Clock, PlusSquare, Settings, Wifi } from 'lucide-react';
import type {
  AndroidDeviceStatus,
  SavedContact,
  ScheduledWhatsAppTask,
  SentHistoryItem,
} from './types/ghost';
import {
  INITIAL_CONTACTS,
  INITIAL_HISTORY,
  INITIAL_TASKS,
  makeInitials,
} from './data/seedData';
import {
  cancelNativeAlarmTask,
  executeNativeTaskNow,
  getAndroidDeviceStatus,
  isRunningInNativeApk,
  loadNativeContactsList,
  scheduleNativeAlarmTask,
  syncNativeDarkMode,
} from './bridge/nativeBridge';
import { CommandDeck } from './components/CommandDeck';
import { QueueView } from './components/QueueView';
import { SetupView } from './components/SetupView';
import { LiveScreenStage } from './components/LiveScreenStage';

type ActiveTab = 'new' | 'scheduled' | 'settings';

const STORAGE_KEYS = {
  contacts: 'ghost_contacts_v4',
  tasks: 'ghost_tasks_v4',
  history: 'ghost_history_v4',
  darkMode: 'ghost_dark_mode_v1',
};

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function App() {
  const nativeMode = isRunningInNativeApk();

  const [activeTab, setActiveTab] = useState<ActiveTab>('new');
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    loadStored(STORAGE_KEYS.darkMode, false)
  );

  const [contacts, setContacts] = useState<SavedContact[]>(() =>
    loadStored(STORAGE_KEYS.contacts, INITIAL_CONTACTS)
  );
  const [tasks, setTasks] = useState<ScheduledWhatsAppTask[]>(() =>
    loadStored(STORAGE_KEYS.tasks, INITIAL_TASKS)
  );
  const [history, setHistory] = useState<SentHistoryItem[]>(() =>
    loadStored(STORAGE_KEYS.history, INITIAL_HISTORY)
  );

  const [deviceStatus, setDeviceStatus] = useState<AndroidDeviceStatus>(() =>
    getAndroidDeviceStatus()
  );

  const [previewTask, setPreviewTask] =
    useState<ScheduledWhatsAppTask | null>(null);
  const [hardwareKillSignal, setHardwareKillSignal] = useState(0);
  const [statusClock, setStatusClock] = useState('05:00');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    syncNativeDarkMode(darkMode);
    try {
      localStorage.setItem(STORAGE_KEYS.darkMode, JSON.stringify(darkMode));
    } catch {}
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
    try {
      localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(contacts));
    } catch {}
  }, [contacts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
    } catch {}
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    setDeviceStatus(getAndroidDeviceStatus());
    if (nativeMode) {
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
    }
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
        if (updatedRecipients && updatedRecipients.length > 1) {
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
  };

  const handleScheduleTask = (task: ScheduledWhatsAppTask) => {
    scheduleNativeAlarmTask(task);
    setTasks((prev) => [task, ...prev]);
  };

  const handleToggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nextEnabled = !t.enabled;
        if (nextEnabled) {
          scheduleNativeAlarmTask({ ...t, enabled: true });
        } else {
          cancelNativeAlarmTask(t.id);
        }
        return { ...t, enabled: nextEnabled };
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

  const activeCount = tasks.filter((t) => t.enabled).length;

  const androidAppContent = (
    <div className="flex flex-col h-full bg-ghost-canvas text-ghost-ink">
      {!nativeMode && (
        <div className="hidden sm:flex px-4 py-2 border-b-[1.5px] border-ghost-border items-center justify-between text-[11px] font-mono font-medium text-ghost-secondary shrink-0">
          <span>{statusClock}</span>
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3 h-3" />
            <div className="w-4 h-2 bg-ghost-red" />
          </div>
        </div>
      )}

      {/* Boxy Minimal Header (No Download APK Button) */}
      <header className="px-4 py-3 border-b-[1.5px] border-ghost-border bg-ghost-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-ghost-red neon-pulse" />
          <span className="font-bold tracking-wider uppercase text-sm text-ghost-ink">
            Ghost
          </span>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('scheduled')}
          className="btn-outline px-2.5 py-1 text-[10px] font-mono"
        >
          {activeCount} Scheduled
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-3.5 pt-3">
        {activeTab === 'new' && (
          <CommandDeck
            contacts={contacts}
            onAddContact={handleAddContact}
            onToggleFavouriteContact={handleToggleFavouriteContact}
            onEditContact={handleEditContact}
            onDeleteContact={handleDeleteContact}
            onScheduleTask={handleScheduleTask}
            onPreviewOrSendNow={handleRunOrPreview}
          />
        )}

        {activeTab === 'scheduled' && (
          <QueueView
            tasks={tasks}
            history={history}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onRunTask={handleRunOrPreview}
          />
        )}

        {activeTab === 'settings' && (
          <SetupView
            deviceStatus={deviceStatus}
            darkMode={darkMode}
            onToggleDarkMode={setDarkMode}
          />
        )}
      </main>

      {/* Boxy 3-Tab Bottom Navigation (Outlined + Solid Buttons) */}
      <nav className="bg-ghost-surface border-t-[1.5px] border-ghost-border p-2.5 shrink-0">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'new', label: 'New', icon: PlusSquare },
              { id: 'scheduled', label: 'Scheduled', icon: Clock },
              { id: 'settings', label: 'Settings', icon: Settings },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 rounded-[2px] border-[1.5px] flex flex-col items-center justify-center gap-0.5 transition uppercase tracking-wider ${
                  isActive
                    ? 'bg-ghost-red text-white border-ghost-red shadow-neonSm font-bold'
                    : 'bg-transparent text-ghost-secondary border-ghost-borderStrong hover:border-ghost-red hover:text-ghost-ink font-semibold'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
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
        <div className="w-full sm:w-[404px] h-screen sm:h-[780px] sm:max-h-[90vh] bg-ghost-surface sm:border-2 sm:border-ghost-borderStrong rounded-none sm:rounded-[4px] sm:shadow-2xl overflow-hidden flex flex-col">
          {androidAppContent}
        </div>

        {/* Simulated Volume-Down Hardware Kill-Switch on Desktop */}
        <div className="hidden sm:flex flex-col gap-2.5 mt-28">
          <div className="w-1.5 h-9 bg-ghost-borderStrong" />
          <div className="w-1.5 h-11 bg-ghost-borderStrong mt-2" />
          <button
            type="button"
            onClick={() => setHardwareKillSignal((s) => s + 1)}
            className="w-2.5 h-12 bg-ghost-red hover:w-3.5 transition-all shadow-neonSm cursor-pointer"
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
