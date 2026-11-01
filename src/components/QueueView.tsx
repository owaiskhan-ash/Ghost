import React, { useState } from 'react';
import { Check, Clock, Play, Repeat, Trash2, Users } from 'lucide-react';
import type { ScheduledWhatsAppTask, SentHistoryItem } from '../types/ghost';
import { formatTime12h } from '../data/seedData';

interface QueueViewProps {
  tasks: ScheduledWhatsAppTask[];
  history: SentHistoryItem[];
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onRunTask: (task: ScheduledWhatsAppTask) => void;
}

export const QueueView: React.FC<QueueViewProps> = ({
  tasks,
  history,
  onToggleTask,
  onDeleteTask,
  onRunTask,
}) => {
  const [view, setView] = useState<'upcoming' | 'sent'>('upcoming');

  return (
    <div className="space-y-3 pb-4">
      {/* Sub-Switch: Boxy Solid + Outlined Pair */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setView('upcoming')}
          className={
            view === 'upcoming' ? 'btn-solid py-2' : 'btn-outline py-2'
          }
        >
          Scheduled [{tasks.length}]
        </button>
        <button
          type="button"
          onClick={() => setView('sent')}
          className={view === 'sent' ? 'btn-solid py-2' : 'btn-outline py-2'}
        >
          Sent [{history.length}]
        </button>
      </div>

      {view === 'upcoming' ? (
        tasks.length === 0 ? (
          <div className="box-card p-10 text-center">
            <Clock className="w-6 h-6 text-ghost-red mx-auto mb-2" />
            <div className="text-xs font-bold uppercase tracking-wider text-ghost-secondary">
              No scheduled messages
            </div>
          </div>
        ) : (
          tasks.map((task) => {
            const isBatch = task.recipients && task.recipients.length > 1;
            const appTag =
              task.whatsappPackage === 'com.whatsapp.w4b'
                ? 'WA BUSINESS'
                : 'WHATSAPP';

            return (
              <div
                key={task.id}
                className={`box-card p-3.5 transition space-y-2.5 ${
                  task.enabled ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] bg-ghost-red text-white shrink-0">
                      {formatTime12h(task.scheduledTime24)}
                    </span>
                    <span className="text-sm font-bold text-ghost-ink truncate flex items-center gap-1.5">
                      {isBatch && (
                        <Users className="w-3.5 h-3.5 text-ghost-red shrink-0" />
                      )}
                      <span className="truncate">{task.contactName}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    aria-label="Toggle scheduled message"
                    className={
                      task.enabled
                        ? 'btn-solid px-2.5 py-1 text-[10px] font-mono shrink-0'
                        : 'btn-outline px-2.5 py-1 text-[10px] font-mono shrink-0'
                    }
                  >
                    {task.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {isBatch && task.recipients ? (
                  <div className="space-y-1 bg-ghost-elevated border border-ghost-border rounded-[2px] p-2.5">
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

                <div className="flex items-center justify-between pt-1 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="px-1.5 py-0.5 border border-ghost-borderStrong rounded-[2px] text-[10px] font-mono font-bold text-ghost-secondary shrink-0">
                      {appTag}
                    </span>
                    <span className="text-xs font-mono text-ghost-muted flex items-center gap-1 truncate">
                      {task.repeatMode === 'daily' ? (
                        <>
                          <Repeat className="w-3 h-3 text-ghost-red shrink-0" />{' '}
                          DAILY
                        </>
                      ) : (
                        task.scheduledDate
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRunTask(task)}
                      className="btn-outline-red px-2.5 py-1 text-[10px]"
                    >
                      <Play className="w-3 h-3 fill-current" /> Send
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      className="btn-outline p-1.5"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-ghost-red" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )
      ) : history.length === 0 ? (
        <div className="box-card p-10 text-center text-xs font-bold uppercase tracking-wider text-ghost-secondary">
          No messages sent yet
        </div>
      ) : (
        history.map((item) => (
          <div
            key={item.id}
            className="box-card p-3.5 flex items-center justify-between gap-3"
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
                  <span className="px-1.5 py-0.5 border border-ghost-borderStrong rounded-[2px] text-[9px] font-mono font-bold text-ghost-secondary">
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
              className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] border text-[10px] font-bold uppercase ${
                item.status === 'SENT'
                  ? 'border-ghost-borderStrong bg-ghost-elevated text-ghost-ink'
                  : 'border-ghost-red bg-ghost-redSoft text-ghost-red'
              }`}
            >
              {item.status === 'SENT' ? (
                <>
                  <Check className="w-3 h-3 text-ghost-red" /> Sent
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
