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

  const sequenceSteps = [
    'Wakes on Cue',
    `Opens ${appLabel}`,
    'Sends One by One',
    'Closes WhatsApp',
  ];
  const activeSequenceStep =
    phase === 'opening'
      ? 0
      : phase === 'typing'
        ? 1
        : phase === 'sending'
          ? 2
          : phase === 'done'
            ? 3
            : -1;

  return (
    <div className="soft-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="soft-live-card w-full max-w-sm overflow-hidden p-5">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="min-w-0">
            <div className="soft-section-title">Live dispatch</div>
            <div className="text-xs text-ghost-muted mt-1.5 truncate">
              {appLabel} · {displayTime} · {currentStep.contactName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="soft-round-button"
            aria-label="Close live dispatch"
          >
            <X />
          </button>
        </div>

        <div className="soft-status-pill w-full justify-start mb-4">
          <span
            className={`status-dot ${phase === 'stopped' ? 'is-danger' : ''}`}
          />
          <span className="truncate">{statusLabel[phase]}</span>
        </div>

        <div className="space-y-3">
          {sequenceSteps.map((label, index) => (
            <div
              key={label}
              className={`soft-step-row ${
                index === activeSequenceStep
                  ? 'is-active'
                  : index < activeSequenceStep
                    ? 'is-complete'
                    : ''
              }`}
            >
              <span className="soft-step-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 text-xs font-semibold">{label}</span>
              {index < activeSequenceStep || phase === 'done' ? (
                <Check className="w-4 h-4 text-ghost-accent" />
              ) : index === activeSequenceStep ? (
                <span className="status-dot" />
              ) : null}
            </div>
          ))}
        </div>

        <div className="soft-message-well mt-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-ghost-muted">
                Message preview
              </div>
              <div className="text-xs font-semibold text-ghost-ink mt-1 truncate">
                {currentStep.contactName} · {currentStep.contactPhone}
              </div>
            </div>
            <span className="soft-icon-well !w-9 !h-9 !basis-9">
              {sentBubbleVisible || phase === 'done' ? (
                <CheckCheck className="text-ghost-accent" />
              ) : (
                <Send />
              )}
            </span>
          </div>
          <p className="text-sm leading-5 text-ghost-ink m-0 break-words">
            {typedText ||
              (sentBubbleVisible || phase === 'done'
                ? currentStep.messageBody
                : 'Preparing message…')}
          </p>
          <div className="text-[10px] text-ghost-muted mt-3">
            {steps.length > 1
              ? `Recipient ${stepIdx + 1} of ${steps.length}`
              : task.whatsappPackage}
          </div>
        </div>

        <div className="mt-5">
          {isRunning ? (
            <button
              type="button"
              onClick={stopNow}
              className="soft-pill danger-action w-full !min-h-[48px]"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop dispatch
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span
                className={`soft-pill flex-1 !min-h-[48px] ${
                  phase === 'stopped' ? 'danger-action' : 'text-ghost-accent'
                }`}
              >
                {phase === 'stopped' ? 'Dispatch stopped' : 'Queue completed'}
              </span>
              <button
                type="button"
                onClick={() => {
                  abortedRef.current = false;
                  setStepIdx(0);
                  setRunKey((k) => k + 1);
                }}
                className="soft-round-button"
                aria-label="Replay dispatch"
              >
                <RotateCcw />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
