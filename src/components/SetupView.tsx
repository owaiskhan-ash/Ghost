import React, { useState } from 'react';
import {
  Check,
  Database,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
} from 'lucide-react';
import type { AndroidDeviceStatus } from '../types/ghost';
import { openNativeSettings } from '../bridge/nativeBridge';

interface CacheCounts {
  contacts: number;
  groups: number;
  templates: number;
  tasks: number;
  history: number;
}

interface SetupViewProps {
  deviceStatus: AndroidDeviceStatus;
  darkMode: boolean;
  onToggleDarkMode: (dark: boolean) => void;
  cacheCounts: CacheCounts;
  onClearPhoneCache: () => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  deviceStatus,
  darkMode,
  onToggleDarkMode,
  cacheCounts,
  onClearPhoneCache,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  const permissions = [
    {
      label: 'Auto-Tap Send',
      sub: 'Presses Send inside WhatsApp / WA Business',
      ok: deviceStatus.accessibilityEnabled,
      target: 'accessibility' as const,
    },
    {
      label: 'Exact Time Alarm',
      sub: 'Wakes phone on the exact scheduled minute',
      ok: deviceStatus.exactAlarmAllowed,
      target: 'alarm' as const,
    },
  ];

  const appTargets = [
    {
      name: 'WhatsApp',
      pkg: 'com.whatsapp',
      installed: deviceStatus.whatsappInstalled,
    },
    {
      name: 'WA Business',
      pkg: 'com.whatsapp.w4b',
      installed: deviceStatus.whatsappBusinessInstalled,
    },
  ];

  return (
    <div className="grid grid-cols-12 gap-2.5">
      {/* BENTO THEME TILES (2 Side-by-Side Bento Cards) */}
      <button
        type="button"
        onClick={() => onToggleDarkMode(true)}
        className={`col-span-6 p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-3 ${
          darkMode
            ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent shadow-neonSm'
            : 'bento-card text-ghost-ink'
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-8 h-8 rounded-xl bg-[#07090A] border border-[#32FF4A] flex items-center justify-center">
            <Moon className="w-4 h-4 text-[#32FF4A]" />
          </div>
          {darkMode && <Check className="w-4 h-4 stroke-[2.5]" />}
        </div>
        <div>
          <div className="text-xs font-bold">Dark Mode</div>
          <div
            className={`text-[10px] mt-0.5 ${
              darkMode ? 'opacity-80' : 'text-ghost-muted'
            }`}
          >
            Black + Neon Green
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onToggleDarkMode(false)}
        className={`col-span-6 p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-3 ${
          !darkMode
            ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent shadow-neonSm'
            : 'bento-card text-ghost-ink'
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-8 h-8 rounded-xl bg-[#32FF4A] border border-[#07090A] flex items-center justify-center">
            <Sun className="w-4 h-4 text-[#07090A]" />
          </div>
          {!darkMode && <Check className="w-4 h-4 stroke-[2.5]" />}
        </div>
        <div>
          <div className="text-xs font-bold">Light Mode</div>
          <div
            className={`text-[10px] mt-0.5 ${
              !darkMode ? 'opacity-80' : 'text-ghost-muted'
            }`}
          >
            Neon Green + Black
          </div>
        </div>
      </button>

      {/* BENTO APP ROUTING TILES (2 Side-by-Side Bento Cards) */}
      {appTargets.map((app) => (
        <div
          key={app.pkg}
          className="col-span-6 bento-card p-3.5 flex flex-col justify-between gap-2.5"
        >
          <div className="flex items-center justify-between">
            <Smartphone className="w-4 h-4 text-ghost-accent" />
            <span
              className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase ${
                app.installed
                  ? 'bg-ghost-accent text-ghost-accentInk'
                  : 'bg-ghost-elevated text-ghost-muted'
              }`}
            >
              {app.installed ? 'Ready' : 'Missing'}
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-ghost-ink">{app.name}</div>
            <div className="text-[10px] font-mono text-ghost-muted truncate">
              {app.pkg}
            </div>
          </div>
        </div>
      ))}

      {/* BENTO PERMISSIONS TILE (12 cols) */}
      <section className="col-span-12 bento-card p-3.5 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
          <ShieldCheck className="w-3.5 h-3.5 text-ghost-accent" />
          Android Permissions
        </div>

        <div className="space-y-2">
          {permissions.map((item) => (
            <div
              key={item.label}
              className="bg-ghost-elevated rounded-xl p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-ghost-ink">
                  {item.label}
                </div>
                <div className="text-[11px] text-ghost-muted mt-0.5">
                  {item.sub}
                </div>
              </div>

              {deviceStatus.isNativeApk ? (
                <button
                  type="button"
                  onClick={() => openNativeSettings(item.target)}
                  className={
                    item.ok
                      ? 'btn-outline-accent px-3 py-1.5 text-[11px] shrink-0'
                      : 'btn-solid px-3 py-1.5 text-[11px] shrink-0'
                  }
                >
                  {item.ok ? 'Enabled' : 'Enable'}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-ghost-accent text-ghost-accentInk px-2.5 py-1 rounded-lg shrink-0">
                  <Check className="w-3 h-3" /> Active
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* BENTO PHONE CACHE STORAGE TILE (12 cols) */}
      <section className="col-span-12 bento-card p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
            <Database className="w-3.5 h-3.5 text-ghost-accent" />
            Phone Cache
          </div>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="btn-outline px-2.5 py-1 text-[10px] rounded-lg"
            >
              <Trash2 className="w-3 h-3" /> Clear Cache
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="btn-outline px-2 py-1 text-[10px] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearPhoneCache();
                  setConfirmClear(false);
                }}
                className="btn-solid px-2.5 py-1 text-[10px] rounded-lg"
              >
                Confirm Wipe
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { label: 'Contacts', count: cacheCounts.contacts },
              { label: 'Groups', count: cacheCounts.groups },
              { label: 'Templates', count: cacheCounts.templates },
              { label: 'Schedules', count: cacheCounts.tasks },
            ] as const
          ).map((stat) => (
            <div
              key={stat.label}
              className="bg-ghost-elevated rounded-xl p-2.5 text-center"
            >
              <div className="font-mono text-base font-bold text-ghost-ink">
                {stat.count}
              </div>
              <div className="text-[10px] text-ghost-muted mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
