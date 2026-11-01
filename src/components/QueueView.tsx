import React from 'react';
import { Clock, Play, Trash2 } from 'lucide-react';
import type { ContactProfile, GhostTask } from '../types/ghost';

interface QueueViewProps {
  tasks: GhostTask[];
  contacts: ContactProfile[];
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onSimulateTask: (task: GhostTask, contact: ContactProfile) => void;
}

export const QueueView: React.FC<QueueViewProps> = ({
  tasks,
  contacts,
  onToggleTask,
  onDeleteTask,
  onSimulateTask,
}) => {
  if (tasks.length === 0) {
    return (
      <div className="rounded-3xl bg-ghost-surface border border-ghost-border p-10 text-center">
        <Clock className="w-6 h-6 text-ghost-red mx-auto mb-2" />
        <div className="text-sm font-semibold text-ghost-ink">
          No scheduled tasks
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      {tasks.map((task) => {
        const contact =
          contacts.find((c) => c.id === task.contactId) || contacts[0];
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
                  {task.effectiveTime}
                </span>
                <span className="text-sm font-bold text-ghost-ink truncate">
                  {task.contactName}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onToggleTask(task.id)}
                aria-label="Toggle task"
                className={`w-10 h-5.5 rounded-full p-0.5 transition flex items-center shrink-0 ${
                  task.enabled
                    ? 'bg-ghost-red justify-end'
                    : 'bg-ghost-borderStrong justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow" />
              </button>
            </div>

            <div className="text-sm text-ghost-secondary truncate">
              {task.messageBody}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-ghost-muted">
                {task.targetApp}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSimulateTask(task, contact)}
                  className="px-3 py-1 rounded-full bg-ghost-redSoft hover:bg-ghost-red hover:text-white text-ghost-red text-xs font-semibold transition flex items-center gap-1"
                >
                  <Play className="w-3 h-3 fill-current" /> Run
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
      })}
    </div>
  );
};
