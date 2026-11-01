import React, { useState } from 'react';
import {
  Check,
  Clock,
  Layers,
  Pause,
  Play,
  Repeat,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import type { ScheduledWhatsAppTask, SentHistoryItem } from '../types/ghost';
import { formatTime12h } from '../data/seedData';

interface QueueViewProps {
  tasks: ScheduledWhatsAppTask[];
  history: SentHistoryItem[];
  onPauseOrResumeTask: (id: string) => void;
  onPauseOrResumeAll: (pauseAll: boolean) => void;
  onDeleteTask: (id: string) => void;
  onRunTask: (task: ScheduledWhatsAppTask) => void;
}

export const QueueView: React.FC<QueueViewProps> = ({
  tasks,
  history,
  onPauseOrResumeTask,
  onPauseOrResumeAll,
  onDeleteTask,
  onRunTask,
}) => {
  const [view, setView] = useState<'upcoming' | 'sent'>('upcoming');

  const activeCount = tasks.filter((t) => t.enabled).length;
  const pausedCount = tasks.length - activeCount;

  return (
    <div className="grid grid-cols-12 gap-2.5">
      {/* BENTO SUMMARY SWITCHER (2 Tiles) */}
      <button
        type="button"
        onClick={() => setView('upcoming')}
        className={`col-span-6 p-3.5 rounded-2xl border text-left transition ${
          view === 'upcoming'
            ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent shadow-neonSm'
            : 'bento-card text-ghost-ink'
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-2xl font-bold leading-none">
            {String(tasks.length).padStart(2, '0')}
          </span>
          {pausedCount > 0 && (
            <span
              className={`text-[10px] font-mono font-bold ${
                view === 'upcoming' ? 'opacity-85' : 'text-ghost-muted'
              }`}
            >
              {pausedCount} paused
            </span>
          )}
        </div>
        <div
          className={`text-[11px] font-bold uppercase tracking-wider mt-1.5 ${
            view === 'upcoming' ? 'opacity-80' : 'text-ghost-secondary'
          }`}
        >
          Scheduled
        </div>
      </button>

      <button
        type="button"
        onClick={() => setView('sent')}
        className={`col-span-6 p-3.5 rounded-2xl border text-left transition ${
          view === 'sent'
            ? 'bg-ghost-accent text-ghost-accentInk border-ghost-accent shadow-neonSm'
            : 'bento-card text-ghost-ink'
        }`}
      >
        <div className="font-mono text-2xl font-bold leading-none">
          {String(history.length).padStart(2, '0')}
        </div>
        <div
          className={`text-[11px] font-bold uppercase tracking-wider mt-1.5 ${
            view === 'sent' ? 'opacity-80' : 'text-ghost-secondary'
          }`}
        >
          Delivered
        </div>
      </button>

      {/* Bulk Pause / Resume Bar when multiple schedules exist */}
      {view === 'upcoming' && tasks.length > 1 && (
        <div className="col-span-12 flex items-center justify-between px-1 pt-0.5">
          <span className="text-[11px] font-mono text-ghost-muted">
            {activeCount} active · {pausedCount} paused
          </span>
          <button
            type="button"
            onClick={() => onPauseOrResumeAll(activeCount > 0)}
            className="btn-outline px-2.5 py-1 text-[11px] rounded-lg"
          >
            {activeCount > 0 ? (
              <>
                <Pause className="w-3 h-3" /> Pause All
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" /> Resume All
              </>
            )}
          </button>
        </div>
      )}

      {/* BENTO LIST CARDS */}
      {view === 'upcoming' ? (
        tasks.length === 0 ? (
          <div className="col-span-12 bento-card p-10 text-center">
            <Clock className="w-6 h-6 text-ghost-accent mx-auto mb-2" />
            <div className="text-xs font-bold uppercase tracking-wider text-ghost-secondary">
              No scheduled messages
            </div>
          </div>
        ) : (
          tasks.map((task) => {
            const isBatch = task.recipients && task.recipients.length > 1;
            const appTag =
              task.whatsappPackage === 'com.whatsapp.w4b' ? 'WA BIZ' : 'WA';

            return (
              <div
                key={task.id}
                className={`col-span-12 bento-card p-3.5 transition space-y-2.5 ${
                  task.enabled ? '' : 'opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                        task.enabled
                          ? 'bg-ghost-accent text-ghost-accentInk'
                          : 'bg-ghost-elevated text-ghost-secondary'
                      }`}
                    >
                      {formatTime12h(task.scheduledTime24)}
                    </span>

                    <span className="text-sm font-bold text-ghost-ink truncate flex items-center gap-1.5">
                      {task.groupId ? (
                        <Layers className="w-3.5 h-3.5 text-ghost-accent shrink-0" />
                      ) : isBatch ? (
                        <Users className="w-3.5 h-3.5 text-ghost-accent shrink-0" />
                      ) : null}
                      <span className="truncate">{task.contactName}</span>
                    </span>
                  </div>

                  {/* Active vs Paused Status Pill */}
                  <span
                    className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase shrink-0 flex items-center gap-1 ${
                      task.enabled
                        ? 'bg-ghost-elevated text-ghost-accent'
                        : 'bg-ghost-elevated text-ghost-muted'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        task.enabled ? 'bg-ghost-accent' : 'bg-ghost-muted'
                      }`}
                    />
                    {task.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>

                {isBatch && task.recipients ? (
                  <div className="space-y-1 bg-ghost-elevated rounded-xl p-2.5">
                    {task.recipients.map((r, i) => (
                      <div
                        key={`${r.contactId}-${i}`}
                        className="text-xs flex items-center gap-1.5 truncate"
                      >
                        <span className="font-bold text-ghost-ink shrink-0">
                          {r.contactName}:
                        </span>
                        <span className="text-ghost-secondary truncate">
                          "{r.messageBody}"
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-ghost-secondary truncate">
                    "{task.messageBody}"
                  </div>
                )}

                <div className="flex items-center justify-between pt-0.5 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="px-2 py-0.5 bg-ghost-elevated rounded-md text-[10px] font-mono font-bold text-ghost-secondary shrink-0">
                      {appTag}
                    </span>
                    <span className="text-xs font-mono text-ghost-muted flex items-center gap-1 truncate">
                      {task.repeatMode === 'daily' ? (
                        <>
                          <Repeat className="w-3 h-3 text-ghost-accent shrink-0" />{' '}
                          Daily
                        </>
                      ) : (
                        task.scheduledDate
                      )}
                    </span>
                  </div>

                  {/* Explicit Pause / Resume + Send Now + Delete */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPauseOrResumeTask(task.id)}
                      className={
                        task.enabled
                          ? 'btn-outline px-2.5 py-1 text-[11px] rounded-lg'
                          : 'btn-solid px-2.5 py-1 text-[11px] rounded-lg'
                      }
                    >
                      {task.enabled ? (
                        <>
                          <Pause className="w-3 h-3" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" /> Resume
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onRunTask(task)}
                      className="btn-outline-accent px-2.5 py-1 text-[11px] rounded-lg"
                      title="Send now"
                    >
                      <Send className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      className="btn-outline p-1.5 rounded-lg"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )
      ) : history.length === 0 ? (
        <div className="col-span-12 bento-card p-10 text-center text-xs font-bold uppercase tracking-wider text-ghost-secondary">
          No messages delivered yet
        </div>
      ) : (
        history.map((item) => (
          <div
            key={item.id}
            className="col-span-12 bento-card p-3.5 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ghost-ink truncate">
                  {item.contactName}
                </span>
                <span className="text-xs font-mono text-ghost-muted">
                  {item.sentAt}
                </span>
                {item.whatsappPackage && (
                  <span className="px-1.5 py-0.5 bg-ghost-elevated rounded-md text-[9px] font-mono font-bold text-ghost-secondary">
                    {item.whatsappPackage === 'com.whatsapp.w4b'
                      ? 'WA BIZ'
                      : 'WA'}
                  </span>
                )}
              </div>
              <div className="text-xs text-ghost-secondary truncate mt-0.5">
                "{item.messageBody}"
              </div>
            </div>

            <span
              className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                item.status === 'SENT'
                  ? 'bg-ghost-accent text-ghost-accentInk'
                  : 'bg-ghost-elevated text-ghost-secondary'
              }`}
            >
              {item.status === 'SENT' ? (
                <>
                  <Check className="w-3 h-3" /> Sent
                </>
              ) : (
                'Stopped'
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
};
