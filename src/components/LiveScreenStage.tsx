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
import { formatTime12h, resolveMessageVariables } from '../data/seedData';
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
    const now = new Date();
    if (task.recipients && task.recipients.length > 0) {
      return task.recipients.map((r) => ({
        ...r,
        messageBody: resolveMessageVariables(
          r.messageBody,
          r.contactName,
          now
        ),
      }));
    }
    const cleanPerson = (() => {
      const openIdx = task.contactName.lastIndexOf('(');
      const closeIdx = task.contactName.lastIndexOf(')');
      if (openIdx >= 0 && closeIdx > openIdx + 1) {
        return task.contactName.slice(openIdx + 1, closeIdx).trim();
      }
      return task.contactName;
    })();
    return [
      {
        contactId: task.contactId,
        contactName: task.contactName,
        contactPhone: task.contactPhone,
        contactInitials: task.contactInitials,
        messageBody: resolveMessageVariables(
          task.messageBody,
          cleanPerson,
          now
        ),
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
  const isBusiness = task.whatsappPackage === 'com.whatsapp.w4b';
  const appLabel = isBusiness ? 'WA Business' : 'WhatsApp';
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
      whatsappPackage: task.whatsappPackage,
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
          whatsappPackage: task.whatsappPackage,
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
    opening: `${progressPrefix}Opening ${appLabel} → ${currentStep.contactName}…`,
    typing: `${progressPrefix}Typing message…`,
    sending: `${progressPrefix}Tapping Send…`,
    done:
      steps.length > 1
        ? `Sent ${steps.length} via ${appLabel} · ${displayTime}`
        : `Sent via ${appLabel} · ${displayTime}`,
    stopped: 'Stopped',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="w-full max-w-sm bento-card shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-ghost-border/25 dark:border-ghost-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-ghost-accent text-ghost-accentInk font-mono text-[10px] font-bold uppercase rounded-md">
              {appLabel}
            </span>
            <span className="text-xs font-mono font-bold text-ghost-secondary">
              {displayTime}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-outline p-1.5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {isRunning ? (
            <button
              type="button"
              onClick={stopNow}
              className="btn-solid w-full py-2.5 px-3 justify-between shadow-neon"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-ghost-accentInk animate-ping shrink-0" />
                <span className="truncate">{statusLabel[phase]}</span>
              </span>
              <span className="inline-flex items-center gap-1 bg-ghost-accentInk/15 px-2 py-0.5 rounded-md text-[10px] shrink-0">
                <Square className="w-2.5 h-2.5 fill-current" /> Stop
              </span>
            </button>
          ) : (
            <div className="py-2 px-3 bg-ghost-elevated rounded-xl flex items-center justify-between text-xs font-semibold gap-2">
              <span className="flex items-center gap-1.5 text-ghost-ink truncate">
                <Check className="w-4 h-4 text-ghost-accent shrink-0" />
                <span className="truncate">{statusLabel[phase]}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  abortedRef.current = false;
                  setStepIdx(0);
                  setRunKey((k) => k + 1);
                }}
                className="btn-outline-accent px-2.5 py-1 text-[11px] rounded-lg shrink-0"
              >
                <RotateCcw className="w-3 h-3" /> Replay
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
                      ? 'bg-ghost-accent'
                      : idx === stepIdx
                        ? 'bg-ghost-accent/45'
                        : 'bg-ghost-border/30'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Simulated WhatsApp / WA Business Chat */}
          <div className="rounded-2xl overflow-hidden border border-ghost-border/25 dark:border-ghost-border bg-[#EFEAE2]">
            <div
              className={`px-3.5 py-2.5 flex items-center justify-between border-b ${
                isBusiness
                  ? 'bg-[#253746] text-white border-[#1B2833]'
                  : 'bg-[#075E54] text-white border-[#054C44]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-black/25 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                  {currentStep.contactInitials}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">
                    {currentStep.contactName}
                  </div>
                  <div className="text-[10px] font-mono opacity-80 truncate">
                    {currentStep.contactPhone}
                  </div>
                </div>
              </div>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 bg-black/25 rounded-md shrink-0">
                {task.whatsappPackage}
              </span>
            </div>

            <div className="p-3.5 min-h-[136px] flex flex-col justify-end">
              {(sentBubbleVisible || phase === 'done') && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-sm bg-[#D9FDD3] text-[#111B21]">
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
              <div className="flex-1 bg-white border border-[#D1D7DB] rounded-xl px-3 py-1.5 text-xs min-h-[30px] flex items-center text-[#111B21]">
                {typedText || <span className="text-[#8696A0]">Message</span>}
              </div>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
                  phase === 'sending'
                    ? 'bg-[#32FF4A] text-[#07090A] scale-105'
                    : isBusiness
                      ? 'bg-[#253746] text-white'
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
