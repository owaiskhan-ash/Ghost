import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  RotateCcw,
  Send,
  Square,
  X,
} from 'lucide-react';
import type { ScheduledWhatsAppTask, SentHistoryItem } from '../types/ghost';
import { formatTime12h } from '../data/seedData';
import { triggerNativeEmergencyStop } from '../bridge/nativeBridge';

interface LiveScreenStageProps {
  task: ScheduledWhatsAppTask;
  onClose: () => void;
  onHistoryAdded: (item: SentHistoryItem) => void;
  externalKillSignal?: number;
}

type SendPhase = 'opening' | 'typing' | 'sending' | 'sent' | 'stopped';

export const LiveScreenStage: React.FC<LiveScreenStageProps> = ({
  task,
  onClose,
  onHistoryAdded,
  externalKillSignal = 0,
}) => {
  const [phase, setPhase] = useState<SendPhase>('opening');
  const [typedText, setTypedText] = useState('');
  const [runKey, setRunKey] = useState(0);
  const loggedRef = useRef(false);
  const prevKillSignal = useRef(externalKillSignal);

  const displayTime = formatTime12h(task.scheduledTime24);
  const isRunning =
    phase === 'opening' || phase === 'typing' || phase === 'sending';

  const stopNow = () => {
    if (!isRunning) return;
    triggerNativeEmergencyStop();
    setPhase('stopped');
    if (!loggedRef.current) {
      loggedRef.current = true;
      onHistoryAdded({
        id: `hist-${Date.now()}`,
        taskId: task.id,
        contactName: task.contactName,
        contactPhone: task.contactPhone,
        messageBody: task.messageBody,
        sentAt: displayTime,
        status: 'STOPPED',
      });
    }
  };

  useEffect(() => {
    if (externalKillSignal !== prevKillSignal.current) {
      prevKillSignal.current = externalKillSignal;
      stopNow();
    }
  });

  useEffect(() => {
    loggedRef.current = false;
    setTypedText('');
    setPhase('opening');

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        setPhase('typing');
        const full = task.messageBody;
        let idx = 0;
        const iv = setInterval(() => {
          idx += 2;
          setTypedText(full.slice(0, idx));
          if (idx >= full.length) clearInterval(iv);
        }, 45);
        timers.push(iv as unknown as ReturnType<typeof setTimeout>);
      }, 800)
    );

    timers.push(
      setTimeout(() => {
        setTypedText(task.messageBody);
        setPhase('sending');
      }, 1900)
    );

    timers.push(
      setTimeout(() => {
        setTypedText('');
        setPhase('sent');
        if (!loggedRef.current) {
          loggedRef.current = true;
          onHistoryAdded({
            id: `hist-${Date.now()}`,
            taskId: task.id,
            contactName: task.contactName,
            contactPhone: task.contactPhone,
            messageBody: task.messageBody,
            sentAt: displayTime,
            status: 'SENT',
          });
        }
      }, 2600)
    );

    return () => timers.forEach((t) => clearTimeout(t));
  }, [runKey, task.id]);

  const statusLabel: Record<SendPhase, string> = {
    opening: 'Opening WhatsApp…',
    typing: 'Entering message…',
    sending: 'Tapping Send…',
    sent: `Sent · ${displayTime}`,
    stopped: 'Stopped',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ghost-ink/40 backdrop-blur-sm p-3">
      <div className="w-full max-w-sm rounded-3xl bg-ghost-canvas border border-ghost-border shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-ghost-surface border-b border-ghost-border flex items-center justify-between">
          <span className="text-xs font-bold text-ghost-ink">
            WhatsApp · {displayTime}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-ghost-recessed hover:bg-ghost-border text-ghost-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {isRunning ? (
            <button
              type="button"
              onClick={stopNow}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-ghost-red text-white shadow-neon flex items-center justify-between text-xs font-semibold"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                {statusLabel[phase]}
              </span>
              <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-[11px]">
                <Square className="w-2.5 h-2.5 fill-current" /> Stop
              </span>
            </button>
          ) : (
            <div className="py-2.5 px-3.5 rounded-2xl bg-ghost-surface border border-ghost-border flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-ghost-ink">
                <Check className="w-4 h-4 text-ghost-red" />
                {statusLabel[phase]}
              </span>
              <button
                type="button"
                onClick={() => setRunKey((k) => k + 1)}
                className="text-ghost-red flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Replay
              </button>
            </div>
          )}

          {/* Simulated WhatsApp Chat */}
          <div className="rounded-2xl overflow-hidden border border-ghost-border bg-[#EFEAE2]">
            <div className="bg-[#F0F2F5] px-3.5 py-2.5 flex items-center gap-2.5 border-b border-[#D1D7DB]">
              <div className="w-8 h-8 rounded-full bg-ghost-ink text-white text-xs font-bold flex items-center justify-center">
                {task.contactInitials}
              </div>
              <div>
                <div className="text-xs font-bold text-[#111B21]">
                  {task.contactName}
                </div>
                <div className="text-[10px] font-mono text-[#667781]">
                  {task.contactPhone}
                </div>
              </div>
            </div>

            <div className="p-3.5 min-h-[140px] flex flex-col justify-end">
              {phase === 'sent' && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-sm bg-[#D9FDD3] text-[#111B21]">
                    <div className="font-medium">{task.messageBody}</div>
                    <div className="text-[10px] text-[#667781] flex items-center justify-end gap-1 mt-0.5">
                      <span>{displayTime}</span>
                      <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#F0F2F5] px-3 py-2 flex items-center gap-2 border-t border-[#D1D7DB]">
              <div className="flex-1 bg-white rounded-full px-3.5 py-1.5 text-xs min-h-[30px] flex items-center text-[#111B21]">
                {typedText || <span className="text-[#8696A0]">Message</span>}
              </div>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                  phase === 'sending'
                    ? 'bg-ghost-red text-white scale-110'
                    : 'bg-[#00A884] text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
