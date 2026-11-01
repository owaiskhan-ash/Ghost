import React, { useEffect, useState } from 'react';
import { Check, CircleDot, Lock, Square } from 'lucide-react';
import type { AndroidDeviceStatus, RecordedSkill } from '../types/ghost';
import { openNativeSettings } from '../bridge/nativeBridge';

interface ShieldSkillsViewProps {
  deviceStatus: AndroidDeviceStatus;
  skills: RecordedSkill[];
  onAddSkill: (skill: RecordedSkill) => void;
}

export const ShieldSkillsView: React.FC<ShieldSkillsViewProps> = ({
  deviceStatus,
  skills,
  onAddSkill,
}) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [skillName, setSkillName] = useState('');

  useEffect(() => {
    if (!recording) return;
    setSeconds(0);
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [recording]);

  const saveSkill = () => {
    setRecording(false);
    onAddSkill({
      id: `skill-${Date.now()}`,
      name: skillName.trim() || 'Custom Flow',
      targetPackage: 'com.whatsapp',
      appLabel: 'Custom',
      stepsCount: 3,
      avgLatencyMs: 80,
      nodePathSummary: ['Recorded tap sequence'],
      parameterSlots: [],
      lastUsed: 'Just now',
    });
    setSkillName('');
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Minimal Status Card */}
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-3">
        <div className="text-xs font-semibold text-ghost-muted uppercase tracking-wider">
          Protection
        </div>

        {[
          {
            label: 'Screen Control',
            ok: deviceStatus.accessibilityEnabled,
            target: 'accessibility' as const,
          },
          {
            label: '5 AM Exact Wake',
            ok: deviceStatus.exactAlarmAllowed,
            target: 'alarm' as const,
          },
          {
            label: 'Kill-Switch Overlay',
            ok: deviceStatus.overlayAllowed,
            target: 'overlay' as const,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between py-1"
          >
            <span className="text-sm font-medium text-ghost-ink">
              {item.label}
            </span>
            {deviceStatus.isNativeApk ? (
              <button
                type="button"
                onClick={() => openNativeSettings(item.target)}
                className="px-3 py-1 rounded-full bg-ghost-red text-white text-xs font-semibold"
              >
                {item.ok ? 'Active' : 'Enable'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ghost-red bg-ghost-redSoft px-2.5 py-0.5 rounded-full">
                <Check className="w-3 h-3" /> Ready
              </span>
            )}
          </div>
        ))}

        <div className="pt-2 border-t border-ghost-border flex items-center justify-between text-xs">
          <span className="text-ghost-secondary flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-ghost-red" />
            Calls & payments blocked
          </span>
          <span className="font-mono text-ghost-red font-semibold">Locked</span>
        </div>
      </section>

      {/* Minimal Skill Recorder */}
      <section className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 space-y-3">
        <div className="text-xs font-semibold text-ghost-muted uppercase tracking-wider">
          Saved Skills
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            disabled={recording}
            placeholder="New skill name…"
            className="flex-1 rounded-2xl bg-white border border-ghost-border focus:border-ghost-red focus:outline-none px-3 py-2 text-xs text-ghost-ink"
          />
          {!recording ? (
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="px-3.5 py-2 rounded-2xl bg-ghost-red text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              <CircleDot className="w-3.5 h-3.5" /> Record
            </button>
          ) : (
            <button
              type="button"
              onClick={saveSkill}
              className="px-3.5 py-2 rounded-2xl bg-ghost-ink text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Square className="w-3 h-3 fill-current text-ghost-red" />
              Save ({seconds}s)
            </button>
          )}
        </div>

        <div className="space-y-2 pt-1">
          {skills.map((sk) => (
            <div
              key={sk.id}
              className="rounded-2xl bg-white border border-ghost-border px-3.5 py-2.5 flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-semibold text-ghost-ink">
                  {sk.name}
                </div>
                <div className="text-[11px] text-ghost-muted">
                  {sk.nodePathSummary[0]}
                </div>
              </div>
              <span className="text-[11px] font-mono text-ghost-red font-semibold">
                {sk.stepsCount} steps
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
