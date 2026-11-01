import { useEffect, useState } from 'react';
import {
  Clock,
  Download,
  History,
  Maximize2,
  Shield,
  Smartphone,
  Sparkles,
  Wifi,
} from 'lucide-react';
import type {
  AndroidDeviceStatus,
  ApkMetadata,
  ContactProfile,
  ExecutionReceipt,
  GhostTask,
  RecordedSkill,
} from './types/ghost';
import {
  INITIAL_CONTACTS,
  INITIAL_RECEIPTS,
  INITIAL_SKILLS,
  INITIAL_TASKS,
} from './data/seedData';
import {
  cancelNativeAlarmTask,
  getAndroidDeviceStatus,
  isRunningInNativeApk,
  scheduleNativeAlarmTask,
} from './bridge/nativeBridge';
import { CommandDeck } from './components/CommandDeck';
import { QueueView } from './components/QueueView';
import { ShieldSkillsView } from './components/ShieldSkillsView';
import { ReceiptsView } from './components/ReceiptsView';
import { LiveScreenStage } from './components/LiveScreenStage';
import { ApkStudioModal } from './components/ApkStudioModal';

type ActiveTab = 'command' | 'queue' | 'shield' | 'receipts';

const STORAGE_KEYS = {
  contacts: 'ghost_contacts_v2',
  tasks: 'ghost_tasks_v2',
  receipts: 'ghost_receipts_v2',
  skills: 'ghost_skills_v2',
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

  const [activeTab, setActiveTab] = useState<ActiveTab>('command');
  const [phoneFrameMode, setPhoneFrameMode] = useState<boolean>(
    () =>
      typeof window !== 'undefined' && window.innerWidth >= 640 && !nativeMode
  );

  const [contacts, setContacts] = useState<ContactProfile[]>(() =>
    loadStored(STORAGE_KEYS.contacts, INITIAL_CONTACTS)
  );
  const [tasks, setTasks] = useState<GhostTask[]>(() =>
    loadStored(STORAGE_KEYS.tasks, INITIAL_TASKS)
  );
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>(() =>
    loadStored(STORAGE_KEYS.receipts, INITIAL_RECEIPTS)
  );
  const [skills, setSkills] = useState<RecordedSkill[]>(() =>
    loadStored(STORAGE_KEYS.skills, INITIAL_SKILLS)
  );

  const [deviceStatus, setDeviceStatus] = useState<AndroidDeviceStatus>(() =>
    getAndroidDeviceStatus()
  );
  const [apkMeta, setApkMeta] = useState<ApkMetadata | null>(null);
  const [showApkModal, setShowApkModal] = useState(false);

  const [liveStage, setLiveStage] = useState<{
    task: GhostTask;
    contact: ContactProfile;
  } | null>(null);
  const [hardwareKillSignal, setHardwareKillSignal] = useState(0);
  const [statusClock, setStatusClock] = useState('05:00');

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
      localStorage.setItem(STORAGE_KEYS.receipts, JSON.stringify(receipts));
    } catch {}
  }, [receipts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.skills, JSON.stringify(skills));
    } catch {}
  }, [skills]);

  useEffect(() => {
    setDeviceStatus(getAndroidDeviceStatus());
    if (!nativeMode) {
      fetch('/api/apk-meta')
        .then((r) => r.json())
        .then((d: ApkMetadata) => {
          if (d && d.available) setApkMeta(d);
        })
        .catch(() => {});
    }
  }, [nativeMode]);

  const handleArmTask = (task: GhostTask) => {
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

  const activeArmedCount = tasks.filter((t) => t.enabled).length;

  const androidAppContent = (
    <div className="flex flex-col h-full bg-ghost-canvas text-ghost-ink">
      {/* Minimal Status Bar */}
      {!nativeMode && phoneFrameMode && (
        <div className="px-6 pt-3 pb-1 flex items-center justify-between text-[11px] font-mono font-medium text-ghost-secondary shrink-0">
          <span>{statusClock}</span>
          <div className="w-14 h-3.5 rounded-full bg-ghost-ink/85" />
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3 h-3" />
            <div className="w-4 h-2 rounded-sm bg-ghost-red" />
          </div>
        </div>
      )}

      {/* Minimal App Header */}
      <header className="px-5 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-ghost-red neon-pulse" />
          <span className="font-bold tracking-tight text-base text-ghost-ink">
            Ghost
          </span>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className="px-3 py-1 rounded-full bg-ghost-surface border border-ghost-border text-xs font-semibold text-ghost-secondary hover:text-ghost-ink transition"
        >
          {activeArmedCount} active
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-1">
        {activeTab === 'command' && (
          <CommandDeck
            contacts={contacts}
            deviceStatus={deviceStatus}
            onAddContact={(c) => setContacts((prev) => [c, ...prev])}
            onArmTask={handleArmTask}
            onDryRunTask={(task, contact) => setLiveStage({ task, contact })}
          />
        )}

        {activeTab === 'queue' && (
          <QueueView
            tasks={tasks}
            contacts={contacts}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onSimulateTask={(task, contact) => setLiveStage({ task, contact })}
          />
        )}

        {activeTab === 'shield' && (
          <ShieldSkillsView
            deviceStatus={deviceStatus}
            skills={skills}
            onAddSkill={(sk) => setSkills((prev) => [sk, ...prev])}
          />
        )}

        {activeTab === 'receipts' && <ReceiptsView receipts={receipts} />}
      </main>

      {/* Clean Minimal Bottom Nav */}
      <nav className="bg-ghost-surface/90 backdrop-blur border-t border-ghost-border px-3 pt-2 pb-2.5 shrink-0">
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              { id: 'command', label: 'New', icon: Sparkles },
              { id: 'queue', label: 'Tasks', icon: Clock },
              { id: 'shield', label: 'Safety', icon: Shield },
              { id: 'receipts', label: 'Log', icon: History },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition ${
                  isActive
                    ? 'bg-ghost-red text-white shadow-neonSm'
                    : 'text-ghost-secondary hover:text-ghost-ink'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {!nativeMode && phoneFrameMode && (
          <div className="mt-2 flex justify-center">
            <div className="w-24 h-1 rounded-full bg-ghost-borderStrong" />
          </div>
        )}
      </nav>
    </div>
  );

  if (nativeMode) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-ghost-canvas">
        {androidAppContent}
        {liveStage && (
          <LiveScreenStage
            task={liveStage.task}
            contact={liveStage.contact}
            onClose={() => setLiveStage(null)}
            onReceiptGenerated={(r) => setReceipts((prev) => [r, ...prev])}
            externalKillSignal={hardwareKillSignal}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-ghost-canvas text-ghost-ink">
      {/* Minimal Viewport Bar */}
      <div className="px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ghost-red" />
          <span className="text-xs font-bold tracking-tight text-ghost-ink">
            Ghost v1.1
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPhoneFrameMode((v) => !v)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ghost-surface border border-ghost-border text-xs font-medium text-ghost-secondary hover:text-ghost-ink transition"
          >
            {phoneFrameMode ? (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-ghost-red" /> Full
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-ghost-red" /> Phone
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowApkModal(true)}
            className="px-3.5 py-1.5 rounded-full bg-ghost-red hover:bg-ghost-redHover text-white text-xs font-bold shadow-neonSm transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            APK
          </button>
        </div>
      </div>

      {phoneFrameMode ? (
        <div className="flex-1 flex items-center justify-center p-3 sm:p-5">
          <div className="relative flex items-start">
            <div className="w-[384px] sm:w-[396px] h-[760px] max-h-[85vh] rounded-[44px] bg-[#D8DDE5] p-[9px] shadow-[0_20px_50px_-15px_rgba(17,19,24,0.18)] border border-[#C6CDD8]">
              <div className="w-full h-full rounded-[36px] overflow-hidden border border-ghost-border bg-ghost-canvas">
                {androidAppContent}
              </div>
            </div>

            {/* Subtle Fluorescent Red Vol-Down Kill-Switch Side Key */}
            <div className="hidden sm:flex flex-col gap-2.5 mt-28 -ml-[1px]">
              <div className="w-1 h-9 bg-[#BFC6D2] rounded-r" />
              <div className="w-1 h-11 bg-[#BFC6D2] rounded-r mt-2" />
              <button
                type="button"
                onClick={() => setHardwareKillSignal((s) => s + 1)}
                className="w-2 h-12 bg-ghost-red hover:w-3 transition-all rounded-r shadow-neonSm cursor-pointer"
                title="Volume-Down Stop Key"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 max-w-md w-full mx-auto bg-ghost-canvas min-h-[calc(100vh-48px)] flex flex-col">
          {androidAppContent}
        </div>
      )}

      {liveStage && (
        <LiveScreenStage
          task={liveStage.task}
          contact={liveStage.contact}
          onClose={() => setLiveStage(null)}
          onReceiptGenerated={(r) => setReceipts((prev) => [r, ...prev])}
          externalKillSignal={hardwareKillSignal}
        />
      )}

      {showApkModal && (
        <ApkStudioModal
          meta={apkMeta}
          onClose={() => setShowApkModal(false)}
        />
      )}
    </div>
  );
}

export default App;
