import React, { useEffect, useState } from 'react';
import {
  Battery,
  Check,
  Clock,
  Database,
  Layers,
  Lock,
  LockOpen,
  Monitor,
  Moon,
  Power,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
} from 'lucide-react';
import type { AndroidDeviceStatus } from '../types/ghost';
import {
  getDesktopStatus,
  type NativeSettingsTarget,
  openNativeSettings,
  setDesktopAutoLaunch,
} from '../bridge/nativeBridge';

interface CacheCounts {
  contacts: number;
  groups: number;
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
  const [autoLaunch, setAutoLaunch] = useState(false);
  const desktopMode = Boolean(deviceStatus.isDesktopApp);

  useEffect(() => {
    if (!desktopMode) return;
    void getDesktopStatus().then((status) => {
      if (status) setAutoLaunch(status.autoLaunchEnabled);
    });
  }, [desktopMode]);

  const permissions: Array<{
    label: string;
    sub: string;
    ok: boolean;
    target: NativeSettingsTarget;
  }> = desktopMode
    ? [
        {
          label: 'Windows control bridge',
          sub: 'Built into Windows — no permission prompt is shown',
          ok: true,
          target: 'accessibility',
        },
        {
          label: 'Tray Scheduler',
          sub: 'Schedules remain active while Ghost is in the tray',
          ok: true,
          target: 'alarm',
        },
        {
          label: 'Start with Windows',
          sub: 'Launch Ghost automatically after Windows sign-in',
          ok: autoLaunch,
          target: 'battery',
        },
        {
          label: 'Interactive Desktop',
          sub: 'WhatsApp must be signed in and Windows must be unlocked',
          ok: true,
          target: 'overlay',
        },
      ]
    : [
        {
          label: 'Auto-Tap Send',
          sub: 'Runs 24/7 even when Ghost app is closed',
          ok: deviceStatus.accessibilityEnabled,
          target: 'accessibility',
        },
        {
          label: 'Exact Time Wake',
          sub: 'Wakes sleeping phone on exact minute',
          ok: deviceStatus.exactAlarmAllowed,
          target: 'alarm',
        },
        {
          label: 'Unrestricted Battery',
          sub: 'Prevents OS from killing closed-app alarms',
          ok: deviceStatus.batteryUnrestricted,
          target: 'battery',
        },
        {
          label: 'Appear on Top',
          sub: 'Allows opening WhatsApp from background',
          ok: deviceStatus.overlayAllowed,
          target: 'overlay',
        },
      ];

  const permissionIcons = desktopMode
    ? ([Monitor, Clock, Power, Layers] as const)
    : ([Check, Clock, Battery, Layers] as const);

  const appTargets = desktopMode
    ? [
        {
          name: 'WhatsApp Desktop',
          pkg: 'whatsapp://',
          installed: true,
        },
        {
          name: 'WA Business Web',
          pkg: 'web.whatsapp.com',
          installed: true,
        },
      ]
    : [
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

  const noPasswordLock = !deviceStatus.screenLockSecure;

  return (
    <div className="setup-view soft-screen grid grid-cols-12">
      {/* Saved theme preference — app material remains unified Soft UI */}
      <button
        type="button"
        onClick={() => onToggleDarkMode(true)}
        className={`soft-theme-card col-span-6 p-4 rounded-[28px] text-left flex flex-col justify-between gap-4 ${
          darkMode ? 'is-active' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="soft-icon-well">
            <Moon />
          </span>
          {darkMode && <Check className="w-4 h-4 text-ghost-accent" />}
        </div>
        <div>
          <div className="text-[15px] font-semibold">Dark mode</div>
          <div className="text-xs text-ghost-muted mt-1">Charcoal Soft UI</div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onToggleDarkMode(false)}
        className={`soft-theme-card col-span-6 p-4 rounded-[28px] text-left flex flex-col justify-between gap-4 ${
          !darkMode ? 'is-active' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="soft-icon-well">
            <Sun />
          </span>
          {!darkMode && <Check className="w-4 h-4 text-ghost-accent" />}
        </div>
        <div>
          <div className="text-[15px] font-semibold">Light mode</div>
          <div className="text-xs text-ghost-muted mt-1">Light grey Soft UI</div>
        </div>
      </button>

      {appTargets.map((app) => (
        <div
          key={app.pkg}
          className={`soft-route-card col-span-6 p-4 rounded-[28px] flex flex-col justify-between gap-4 ${
            app.installed ? 'is-active' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="soft-icon-well">
              {desktopMode ? <Monitor /> : <Smartphone />}
            </span>
            <span className="soft-pill !min-h-[28px] !px-2.5 text-[9px] uppercase tracking-[0.12em]">
              <span
                className={`status-dot ${
                  app.installed ? '' : 'is-muted'
                }`}
              />
              {app.installed ? (desktopMode ? 'Route' : 'Ready') : 'Missing'}
            </span>
          </div>
          <div>
            <div className="text-[15px] font-semibold">{app.name}</div>
            <div className="text-[10px] text-ghost-muted truncate mt-1">
              {app.pkg}
            </div>
          </div>
        </div>
      ))}

      <section className="col-span-12 soft-lock-row">
        <span className="soft-icon-well">
          {desktopMode ? <Lock /> : noPasswordLock ? <LockOpen /> : <Lock />}
        </span>
        <div className="soft-row-copy">
          <div className="soft-row-title">
            {desktopMode
              ? 'Unlocked Windows session required'
              : noPasswordLock
                ? 'No-password lock is ready'
                : 'PIN / password lock detected'}
          </div>
          <div className="soft-row-meta">
            {desktopMode
              ? 'Ghost never bypasses Windows sign-in or the lock screen'
              : noPasswordLock
                ? 'Wakes screen and dismisses Swipe lock'
                : 'Shows a notification if locked at send time'}
          </div>
        </div>
        {deviceStatus.isNativeApk ? (
          <button
            type="button"
            onClick={() => openNativeSettings('security')}
            className="soft-pill text-ghost-accent"
          >
            {noPasswordLock ? 'Ready' : 'Change'}
          </button>
        ) : (
          <span className="soft-pill text-ghost-accent">
            <Check className="w-3 h-3" /> Ready
          </span>
        )}
      </section>

      <p className="col-span-12 px-3 text-[10px] leading-4 text-ghost-muted">
        {desktopMode
          ? 'Windows does not show an automation permission request. Keep Ghost and WhatsApp at the same normal privilege level, with Windows awake and unlocked and WhatsApp signed in.'
          : 'Automatic sending works only while the screen is unlocked or the phone has no PIN, pattern, or password lock. If securely locked, Ghost shows a notification instead—allow notifications when prompted.'}
      </p>

      <section className="col-span-12 bento-card p-5 space-y-4">
        <div className="soft-section-title flex items-center gap-2 px-1">
          <ShieldCheck className="w-4 h-4 text-ghost-accent" />
          <span>{desktopMode ? 'Desktop readiness' : 'Permissions'}</span>
        </div>

        <div className="space-y-3">
          {permissions.map((item, index) => {
            const PermissionIcon = permissionIcons[index];
            return (
              <div key={item.label} className="soft-permission-row">
                <span className="soft-icon-well">
                  <PermissionIcon />
                </span>
                <div className="soft-row-copy">
                  <div className="soft-row-title">{item.label}</div>
                  <div className="soft-row-meta">{item.sub}</div>
                </div>

                {desktopMode && index === 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      void setDesktopAutoLaunch(!autoLaunch).then(setAutoLaunch);
                    }}
                    className={`soft-toggle ${autoLaunch ? 'is-active' : ''}`}
                    aria-pressed={autoLaunch}
                    aria-label="Start Ghost with Windows"
                    title="Start Ghost automatically after sign-in"
                  >
                    <span className="soft-toggle-knob">
                      {autoLaunch && <Check />}
                    </span>
                  </button>
                ) : desktopMode ? (
                  <span className="soft-pill text-ghost-accent">
                    {index === 0 ? 'No prompt' : index === 1 ? 'Active' : 'Required'}
                  </span>
                ) : deviceStatus.isNativeApk ? (
                  <button
                    type="button"
                    onClick={() => openNativeSettings(item.target)}
                    className={`soft-toggle ${item.ok ? 'is-active' : ''}`}
                    aria-pressed={item.ok}
                    aria-label={`${item.ok ? 'Review' : 'Enable'} ${item.label}`}
                    title={item.ok ? 'Permission enabled' : 'Permission required'}
                  >
                    <span className="soft-toggle-knob">
                      {item.ok && <Check />}
                    </span>
                  </button>
                ) : (
                  <span className="soft-toggle is-active">
                    <span className="soft-toggle-knob">
                      <Check />
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="col-span-12 bento-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="soft-section-title flex items-center gap-2">
            <Database className="w-4 h-4 text-ghost-accent" />
            <span>{desktopMode ? 'Local app data' : 'Phone cache'}</span>
          </div>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="soft-pill danger-action"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="soft-pill"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearPhoneCache();
                  setConfirmClear(false);
                }}
                className="soft-pill danger-action"
              >
                Confirm
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {(
            [
              { label: 'Contacts', count: cacheCounts.contacts },
              { label: 'Groups', count: cacheCounts.groups },
              { label: 'Schedules', count: cacheCounts.tasks },
              { label: 'History', count: cacheCounts.history },
            ] as const
          ).map((stat) => (
            <div
              key={stat.label}
              className="soft-cache-stat rounded-[22px] px-2 py-3 text-center"
            >
              <div className="text-lg font-bold text-ghost-ink">
                {stat.count}
              </div>
              <div className="text-[9px] text-ghost-muted mt-1 truncate">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
