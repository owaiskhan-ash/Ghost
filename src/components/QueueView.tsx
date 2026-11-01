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
      {/* Sub-Switch: Upcoming vs Sent */}
      <div className="flex bg-ghost-recessed p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => setView('upcoming')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition ${
            view === 'upcoming'
              ? 'bg-white text-ghost-ink shadow-sm'
              : 'text-ghost-secondary'
          }`}
        >
          Scheduled ({tasks.length})
        </button>
        <button
          type="button"
          onClick={() => setView('sent')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition ${
            view === 'sent'
              ? 'bg-white text-ghost-ink shadow-sm'
              : 'text-ghost-secondary'
          }`}
        >
          Sent ({history.length})
        </button>
      </div>

      {view === 'upcoming' ? (
        tasks.length === 0 ? (
          <div className="rounded-3xl bg-ghost-surface border border-ghost-border p-10 text-center">
            <Clock className="w-6 h-6 text-ghost-red mx-auto mb-2" />
            <div className="text-sm font-semibold text-ghost-ink">
              No scheduled messages
            </div>
          </div>
        ) : (
          tasks.map((task) => {
            const isBatch = task.recipients && task.recipients.length > 1;
            return (
              <div
                key={task.id}
                className={`rounded-3xl border p-4 transition space-y-2.5 ${
                  task.enabled
                    ? 'bg-ghost-surface border-ghost-border'
                    : 'bg-ghost-recessed/50 border-ghost-border opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full bg-ghost-red text-white shrink-0">
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
                    className={`w-10 h-5.5 rounded-full p-0.5 transition flex items-center shrink-0 ${
                      task.enabled
                        ? 'bg-ghost-red justify-end'
                        : 'bg-ghost-borderStrong justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow" />
                  </button>
                </div>

                {isBatch && task.recipients ? (
                  <div className="space-y-1 rounded-2xl bg-ghost-canvas p-2.5">
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

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-ghost-muted flex items-center gap-1">
                    {task.repeatMode === 'daily' ? (
                      <>
                        <Repeat className="w-3 h-3 text-ghost-red" /> Every day
                      </>
                    ) : (
                      task.scheduledDate
                    )}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onRunTask(task)}
                      className="px-3 py-1 rounded-full bg-ghost-redSoft hover:bg-ghost-red hover:text-white text-ghost-red text-xs font-semibold transition flex items-center gap-1"
                    >
                      <Play className="w-3 h-3 fill-current" /> Send
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      className="p-1.5 rounded-full text-ghost-muted hover:text-ghost-red transition"
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
        <div className="rounded-3xl bg-ghost-surface border border-ghost-border p-10 text-center text-sm font-semibold text-ghost-ink">
          No messages sent yet
        </div>
      ) : (
        history.map((item) => (
          <div
            key={item.id}
            className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ghost-ink truncate">
                  {item.contactName}
                </span>
                <span className="text-xs font-mono text-ghost-muted">
                  {item.sentAt}
                </span>
              </div>
              <div className="text-xs text-ghost-secondary truncate mt-0.5">
                "{item.messageBody}"
              </div>
            </div>

            <span
              className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                item.status === 'SENT'
                  ? 'bg-ghost-recessed text-ghost-ink'
                  : 'bg-ghost-redSoft text-ghost-red'
              }`}
            >
              {item.status === 'SENT' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-ghost-red" /> Sent
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
