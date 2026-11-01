import React from 'react';
import { Check } from 'lucide-react';
import type { AndroidDeviceStatus } from '../types/ghost';
import { openNativeSettings } from '../bridge/nativeBridge';

interface SetupViewProps {
  deviceStatus: AndroidDeviceStatus;
}

export const SetupView: React.FC<SetupViewProps> = ({ deviceStatus }) => {
  const items = [
    {
      label: 'Auto-Tap Send',
      sub: 'Allows Ghost to press Send inside WhatsApp',
      ok: deviceStatus.accessibilityEnabled,
      target: 'accessibility' as const,
    },
    {
      label: 'Exact Time Alarm',
      sub: 'Wakes phone on time for scheduled messages',
      ok: deviceStatus.exactAlarmAllowed,
      target: 'alarm' as const,
    },
  ];

  return (
    <div className="space-y-3.5 pb-4">
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-3.5">
        <div className="text-xs font-semibold text-ghost-secondary">
          Android Setup
        </div>

        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl bg-white border border-ghost-border p-3.5 flex items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm font-semibold text-ghost-ink">
                {item.label}
              </div>
              <div className="text-xs text-ghost-muted mt-0.5">{item.sub}</div>
            </div>

            {deviceStatus.isNativeApk ? (
              <button
                type="button"
                onClick={() => openNativeSettings(item.target)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 ${
                  item.ok
                    ? 'bg-ghost-redSoft text-ghost-red'
                    : 'bg-ghost-red text-white shadow-neonSm'
                }`}
              >
                {item.ok ? 'Enabled' : 'Enable'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ghost-red bg-ghost-redSoft px-3 py-1 rounded-full shrink-0">
                <Check className="w-3.5 h-3.5" /> Ready
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
};
