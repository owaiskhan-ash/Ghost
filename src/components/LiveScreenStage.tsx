import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  PhoneOff,
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
  X,
} from 'lucide-react';
import type {
  ContactProfile,
  ExecutionReceipt,
  GhostTask,
} from '../types/ghost';
import { triggerNativeEmergencyStop } from '../bridge/nativeBridge';

interface LiveScreenStageProps {
  task: GhostTask;
  contact: ContactProfile;
  onClose: () => void;
  onReceiptGenerated: (receipt: ExecutionReceipt) => void;
  externalKillSignal?: number;
}

type SimScenario = 'normal_5am' | 'overnight_emergency';

type ExecutionPhase =
  | 'opening'
  | 'checking'
  | 'typing'
  | 'sending'
  | 'sent'
  | 'paused'
  | 'stopped';

export const LiveScreenStage: React.FC<LiveScreenStageProps> = ({
  task,
  contact,
  onClose,
  onReceiptGenerated,
  externalKillSignal = 0,
}) => {
  const [scenario, setScenario] = useState<SimScenario>('normal_5am');
  const [phase, setPhase] = useState<ExecutionPhase>('opening');
  const [typedText, setTypedText] = useState('');
  const [runKey, setRunKey] = useState(0);
  const receiptSentRef = useRef(false);
  const prevKillSignal = useRef(externalKillSignal);

  const isRunning =
    phase === 'opening' ||
    phase === 'checking' ||
    phase === 'typing' ||
    phase === 'sending';

  const stopNow = () => {
    if (!isRunning) return;
    triggerNativeEmergencyStop();
    setPhase('stopped');
    if (!receiptSentRef.current) {
      receiptSentRef.current = true;
      onReceiptGenerated({
        id: `rcpt-${Date.now()}`,
        taskId: task.id,
        contactName: contact.name,
        targetApp: task.targetApp,
        scheduledFor: task.displayTime,
        executedAt: task.effectiveTime,
        outcome: 'ABORTED_KILLSWITCH',
        messageText: task.messageBody,
        reasonDetail: 'Stopped manually',
        durationMs: 380,
        engineLayersUsed: ['Stopped'],
        guardrailsBlocked: [],
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
    receiptSentRef.current = false;
    setTypedText('');
    setPhase('opening');

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setPhase('checking'), 900));

    if (scenario === 'overnight_emergency' && task.contextGuardEnabled) {
      timers.push(
        setTimeout(() => {
          setPhase('paused');
          if (!receiptSentRef.current) {
            receiptSentRef.current = true;
            onReceiptGenerated({
              id: `rcpt-${Date.now()}`,
              taskId: task.id,
              contactName: contact.name,
              targetApp: task.targetApp,
              scheduledFor: task.displayTime,
              executedAt: task.effectiveTime,
              outcome: 'PAUSED_CONTEXT_GUARD',
              messageText: task.messageBody,
              reasonDetail: 'Paused · Urgent 2 AM text',
              durationMs: 880,
              engineLayersUsed: ['Smart Check'],
              guardrailsBlocked: [],
            });
          }
        }, 2200)
      );
    } else {
      timers.push(
        setTimeout(() => {
          setPhase('typing');
          const full = task.messageBody;
          let idx = 0;
          const iv = setInterval(() => {
            idx += 2;
            setTypedText(full.slice(0, idx));
            if (idx >= full.length) clearInterval(iv);
          }, 50);
          timers.push(iv as unknown as ReturnType<typeof setTimeout>);
        }, 1900)
      );

      timers.push(
        setTimeout(() => {
          setTypedText(task.messageBody);
          setPhase('sending');
        }, 3100)
      );

      timers.push(
        setTimeout(() => {
          setTypedText('');
          setPhase('sent');
          if (!receiptSentRef.current) {
            receiptSentRef.current = true;
            onReceiptGenerated({
              id: `rcpt-${Date.now()}`,
              taskId: task.id,
              contactName: contact.name,
              targetApp: task.targetApp,
              scheduledFor: task.displayTime,
              executedAt: task.effectiveTime,
              outcome: 'SENT',
              messageText: task.messageBody,
              reasonDetail: 'Chat checked · Sent',
              durationMs: 1320,
              engineLayersUsed: ['WhatsApp'],
              guardrailsBlocked: [],
            });
          }
        }, 3900)
      );
    }

    return () => timers.forEach((t) => clearTimeout(t));
  }, [scenario, runKey, task.id]);

  const chatMessages =
    scenario === 'overnight_emergency'
      ? contact.recentMessagesEmergency
      : contact.recentMessagesNormal;

  const statusText: Record<ExecutionPhase, string> = {
    opening: 'Opening WhatsApp…',
    checking: 'Checking recent chat…',
    typing: 'Typing message…',
    sending: 'Tapping Send…',
    sent: 'Sent at ' + task.effectiveTime,
    paused: 'Paused · Urgent 2 AM text',
    stopped: 'Stopped immediately',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ghost-ink/40 backdrop-blur-sm p-3">
      <div className="w-full max-w-sm rounded-3xl bg-ghost-canvas border border-ghost-border shadow-2xl overflow-hidden">
        {/* Minimal Top Header */}
        <div className="px-4 py-3 bg-ghost-surface border-b border-ghost-border flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-ghost-recessed p-0.5 rounded-full">
            <button
              type="button"
              onClick={() => {
                setScenario('normal_5am');
                setRunKey((k) => k + 1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                scenario === 'normal_5am'
                  ? 'bg-ghost-red text-white'
                  : 'text-ghost-secondary'
              }`}
            >
              5 AM Normal
            </button>
            <button
              type="button"
              onClick={() => {
                setScenario('overnight_emergency');
                setRunKey((k) => k + 1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                scenario === 'overnight_emergency'
                  ? 'bg-ghost-red text-white'
                  : 'text-ghost-secondary'
              }`}
            >
              2 AM Urgent
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-ghost-recessed hover:bg-ghost-border text-ghost-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Status / Kill-Switch Pill */}
          {isRunning ? (
            <button
              type="button"
              onClick={stopNow}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-ghost-red text-white shadow-neon flex items-center justify-between text-xs font-semibold"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                {statusText[phase]}
              </span>
              <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-[11px]">
                <Square className="w-2.5 h-2.5 fill-current" /> Stop
              </span>
            </button>
          ) : (
            <div className="py-2.5 px-3.5 rounded-2xl bg-ghost-surface border border-ghost-border flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-ghost-ink">
                {phase === 'sent' ? (
                  <Check className="w-4 h-4 text-ghost-red" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-ghost-red" />
                )}
                {statusText[phase]}
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

          {/* Clean Simulated WhatsApp Screen */}
          <div
            onClick={() => {
              if (isRunning) stopNow();
            }}
            className="rounded-2xl overflow-hidden border border-ghost-border bg-[#EFEAE2]"
          >
            <div className="bg-[#F0F2F5] px-3.5 py-2.5 flex items-center justify-between border-b border-[#D1D7DB]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-ghost-ink text-white text-xs font-bold flex items-center justify-center">
                  {contact.avatarInitials}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#111B21]">
                    {contact.name}
                  </div>
                  <div className="text-[10px] text-[#667781]">
                    {task.effectiveTime}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ghost-redSoft text-ghost-red flex items-center gap-1">
                <PhoneOff className="w-3 h-3" /> Calls Locked
              </span>
            </div>

            <div className="p-3.5 space-y-2 min-h-[165px]">
              {chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.sender === 'me' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
                      m.isUrgentKeyword && phase === 'paused'
                        ? 'bg-ghost-redSoft border border-ghost-red text-ghost-ink'
                        : 'bg-white text-[#111B21]'
                    }`}
                  >
                    <div>{m.text}</div>
                    <div className="text-[10px] text-[#667781] text-right mt-0.5">
                      {m.time}
                    </div>
                  </div>
                </div>
              ))}

              {phase === 'sent' && (
                <div className="flex justify-end">
                  <div className="max-w-[82%] rounded-2xl px-3 py-2 text-xs shadow-sm bg-[#D9FDD3] text-[#111B21]">
                    <div className="font-medium">{task.messageBody}</div>
                    <div className="text-[10px] text-[#667781] flex items-center justify-end gap-1 mt-0.5">
                      <span>{task.effectiveTime}</span>
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
