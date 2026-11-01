import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  RotateCcw,
  Send,
  Square,
  X,
} from 'lucide-react';
import type {
  BatchRecipient,
  ScheduledWhatsAppTask,
  SentHistoryItem,
} from '../types/ghost';
import { formatTime12h } from '../data/seedData';
import { triggerNativeEmergencyStop } from '../bridge/nativeBridge';

interface LiveScreenStageProps {
  task: ScheduledWhatsAppTask;
  onClose: () => void;
  onHistoryAdded: (item: SentHistoryItem) => void;
  externalKillSignal?: number;
}

type SendPhase = 'opening' | 'typing' | 'sending' | 'done' | 'stopped';

export const LiveScreenStage: React.FC<LiveScreenStageProps> = ({
  task,
  onClose,
  onHistoryAdded,
  externalKillSignal = 0,
}) => {
  const steps: BatchRecipient[] = useMemo(() => {
    if (task.recipients && task.recipients.length > 0) {
      return task.recipients;
    }
    return [
      {
        contactId: task.contactId,
        contactName: task.contactName,
        contactPhone: task.contactPhone,
        contactInitials: task.contactInitials,
        messageBody: task.messageBody,
      },
    ];
  }, [task]);

  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<SendPhase>('opening');
  const [typedText, setTypedText] = useState('');
  const [sentBubbleVisible, setSentBubbleVisible] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const abortedRef = useRef(false);
  const prevKillSignal = useRef(externalKillSignal);

  const currentStep = steps[Math.min(stepIdx, steps.length - 1)];
  const displayTime = formatTime12h(task.scheduledTime24);
  const isRunning =
    phase === 'opening' || phase === 'typing' || phase === 'sending';

  const stopNow = () => {
    if (!isRunning) return;
    abortedRef.current = true;
    triggerNativeEmergencyStop();
    setPhase('stopped');
    onHistoryAdded({
      id: `hist-${Date.now()}`,
      taskId: task.id,
      contactName: currentStep.contactName,
      contactPhone: currentStep.contactPhone,
      messageBody: currentStep.messageBody,
      sentAt: displayTime,
      status: 'STOPPED',
    });
  };

  useEffect(() => {
    if (externalKillSignal !== prevKillSignal.current) {
      prevKillSignal.current = externalKillSignal;
      stopNow();
    }
  });

  useEffect(() => {
    abortedRef.current = false;
    setStepIdx(0);
  }, [runKey, task.id]);

  useEffect(() => {
    if (abortedRef.current) return;

    setTypedText('');
    setSentBubbleVisible(false);
    setPhase('opening');

    const active = steps[stepIdx];
    if (!active) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        if (abortedRef.current) return;
        setPhase('typing');
        const full = active.messageBody;
        let idx = 0;
        const iv = setInterval(() => {
          idx += 2;
          setTypedText(full.slice(0, idx));
          if (idx >= full.length) clearInterval(iv);
        }, 40);
        timers.push(iv as unknown as ReturnType<typeof setTimeout>);
      }, 650)
    );

    timers.push(
      setTimeout(() => {
        if (abortedRef.current) return;
        setTypedText(active.messageBody);
        setPhase('sending');
      }, 1650)
    );

    timers.push(
      setTimeout(() => {
        if (abortedRef.current) return;
        setTypedText('');
        setSentBubbleVisible(true);
        onHistoryAdded({
          id: `hist-${Date.now()}-${stepIdx}`,
          taskId: task.id,
          contactName: active.contactName,
          contactPhone: active.contactPhone,
          messageBody: active.messageBody,
          sentAt: displayTime,
          status: 'SENT',
        });

        if (stepIdx + 1 < steps.length) {
          timers.push(
            setTimeout(() => {
              if (!abortedRef.current) {
                setStepIdx((i) => i + 1);
              }
            }, 750)
          );
        } else {
          setPhase('done');
        }
      }, 2250)
    );

    return () => timers.forEach((t) => clearTimeout(t));
  }, [stepIdx, runKey, task.id]);

  const progressPrefix =
    steps.length > 1 ? `(${stepIdx + 1}/${steps.length}) ` : '';

  const statusLabel: Record<SendPhase, string> = {
    opening: `${progressPrefix}Opening ${currentStep.contactName}…`,
    typing: `${progressPrefix}Typing message…`,
    sending: `${progressPrefix}Tapping Send…`,
    done:
      steps.length > 1
        ? `Sent to all ${steps.length} contacts · ${displayTime}`
        : `Sent · ${displayTime}`,
    stopped: 'Stopped',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ghost-ink/40 backdrop-blur-sm p-3">
      <div className="w-full max-w-sm rounded-3xl bg-ghost-canvas border border-ghost-border shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-ghost-surface border-b border-ghost-border flex items-center justify-between">
          <span className="text-xs font-bold text-ghost-ink">
            Screen Control · {displayTime}
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
              <span className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-white animate-ping shrink-0" />
                <span className="truncate">{statusLabel[phase]}</span>
              </span>
              <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-[11px] shrink-0">
                <Square className="w-2.5 h-2.5 fill-current" /> Stop
              </span>
            </button>
          ) : (
            <div className="py-2.5 px-3.5 rounded-2xl bg-ghost-surface border border-ghost-border flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-ghost-ink truncate">
                <Check className="w-4 h-4 text-ghost-red shrink-0" />
                <span className="truncate">{statusLabel[phase]}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  abortedRef.current = false;
                  setStepIdx(0);
                  setRunKey((k) => k + 1);
                }}
                className="text-ghost-red flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Replay
              </button>
            </div>
          )}

          {steps.length > 1 && (
            <div className="flex items-center gap-1.5">
              {steps.map((s, idx) => (
                <div
                  key={`${s.contactId}-${idx}`}
                  className={`flex-1 h-1.5 rounded-full transition ${
                    idx < stepIdx || phase === 'done'
                      ? 'bg-ghost-red'
                      : idx === stepIdx
                        ? 'bg-ghost-red/50'
                        : 'bg-ghost-border'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Simulated WhatsApp Chat */}
          <div className="rounded-2xl overflow-hidden border border-ghost-border bg-[#EFEAE2]">
            <div className="bg-[#F0F2F5] px-3.5 py-2.5 flex items-center gap-2.5 border-b border-[#D1D7DB]">
              <div className="w-8 h-8 rounded-full bg-ghost-ink text-white text-xs font-bold flex items-center justify-center">
                {currentStep.contactInitials}
              </div>
              <div>
                <div className="text-xs font-bold text-[#111B21]">
                  {currentStep.contactName}
                </div>
                <div className="text-[10px] font-mono text-[#667781]">
                  {currentStep.contactPhone}
                </div>
              </div>
            </div>

            <div className="p-3.5 min-h-[140px] flex flex-col justify-end">
              {(sentBubbleVisible || phase === 'done') && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-sm bg-[#D9FDD3] text-[#111B21]">
                    <div className="font-medium">{currentStep.messageBody}</div>
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
