import React from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import type { AndroidDeviceStatus } from '../types/ghost';
import { openNativeSettings } from '../bridge/nativeBridge';

interface SetupViewProps {
  deviceStatus: AndroidDeviceStatus;
  darkMode: boolean;
  onToggleDarkMode: (dark: boolean) => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  deviceStatus,
  darkMode,
  onToggleDarkMode,
}) => {
  const permissions = [
    {
      label: 'Auto-Tap Send',
      sub: 'Accessibility control to press Send inside WhatsApp / WA Business',
      ok: deviceStatus.accessibilityEnabled,
      target: 'accessibility' as const,
    },
    {
      label: 'Exact Time Alarm',
      sub: 'Wakes device on the exact scheduled minute',
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
    <div className="space-y-3 pb-4">
      {/* 1. APPEARANCE — Black & Red Dark Mode Toggle */}
      <section className="box-card p-3.5 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
          Appearance
        </div>

        <div className="bg-ghost-elevated border-[1.5px] border-ghost-border rounded-[2px] p-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-ghost-ink">Dark Mode</div>
            <div className="text-xs text-ghost-muted mt-0.5">
              {darkMode ? 'Black & Fluorescent Red' : 'Light Grey & Red'}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onToggleDarkMode(false)}
              className={
                !darkMode
                  ? 'btn-solid px-2.5 py-1.5 text-[10px]'
                  : 'btn-outline px-2.5 py-1.5 text-[10px]'
              }
            >
              <Sun className="w-3.5 h-3.5" />
              Light
            </button>
            <button
              type="button"
              onClick={() => onToggleDarkMode(true)}
              className={
                darkMode
                  ? 'btn-solid px-2.5 py-1.5 text-[10px]'
                  : 'btn-outline px-2.5 py-1.5 text-[10px]'
              }
            >
              <Moon className="w-3.5 h-3.5" />
              Dark
            </button>
          </div>
        </div>
      </section>

      {/* 2. ANDROID PERMISSIONS */}
      <section className="box-card p-3.5 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
          Permissions
        </div>

        {permissions.map((item) => (
          <div
            key={item.label}
            className="bg-ghost-elevated border-[1.5px] border-ghost-border rounded-[2px] p-3 flex items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm font-bold text-ghost-ink">
                {item.label}
              </div>
              <div className="text-xs text-ghost-muted mt-0.5">{item.sub}</div>
            </div>

            {deviceStatus.isNativeApk ? (
              <button
                type="button"
                onClick={() => openNativeSettings(item.target)}
                className={
                  item.ok
                    ? 'btn-outline-red px-3 py-1.5 text-[10px] shrink-0'
                    : 'btn-solid px-3 py-1.5 text-[10px] shrink-0'
                }
              >
                {item.ok ? 'Enabled' : 'Enable'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-ghost-red border-[1.5px] border-ghost-red px-2.5 py-1 rounded-[2px] shrink-0">
                <Check className="w-3 h-3" /> Ready
              </span>
            )}
          </div>
        ))}
      </section>

      {/* 3. DIRECT APP ROUTING */}
      <section className="box-card p-3.5 space-y-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ghost-secondary">
          App Routing
        </div>

        {appTargets.map((app) => (
          <div
            key={app.pkg}
            className="bg-ghost-elevated border-[1.5px] border-ghost-border rounded-[2px] px-3 py-2.5 flex items-center justify-between gap-2"
          >
            <div>
              <div className="text-xs font-bold text-ghost-ink">{app.name}</div>
              <div className="text-[10px] font-mono text-ghost-muted">
                {app.pkg}
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-[2px] border text-[10px] font-mono font-bold uppercase ${
                app.installed
                  ? 'border-ghost-red text-ghost-red'
                  : 'border-ghost-borderStrong text-ghost-muted'
              }`}
            >
              {app.installed ? 'Detected' : 'Not Installed'}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
};
