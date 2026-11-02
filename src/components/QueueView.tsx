import React, { useEffect, useState } from 'react';
import {
  Check,
  CircleAlert,
  Clock,
  Layers,
  Pause,
  Play,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import type { ScheduledWhatsAppTask, SentHistoryItem } from '../types/ghost';
import { formatRepeatSummary, formatTime24h } from '../data/seedData';

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
  const deliveredCount = history.filter((item) => item.status === 'SENT').length;
  const attentionCount = history.length - deliveredCount;
  const latestReceipt = history[0];

  useEffect(() => {
    if (latestReceipt && latestReceipt.status !== 'SENT') setView('sent');
  }, [latestReceipt?.id, latestReceipt?.status]);

  return (
    <div className="queue-view soft-screen grid grid-cols-12">
      {/* Tactile two-up queue summary */}
      <button
        type="button"
        onClick={() => setView('upcoming')}
        className={`soft-stat-card col-span-6 ${
          view === 'upcoming' ? 'is-active' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="soft-icon-well">
            <Clock />
          </span>
          {pausedCount > 0 && (
            <span className="text-[10px] font-medium text-ghost-muted">
              {pausedCount} paused
            </span>
          )}
        </div>
        <div>
          <div className="soft-stat-number">
            {String(tasks.length).padStart(2, '0')}
          </div>
          <div className="soft-stat-label mt-2">Scheduled</div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setView('sent')}
        className={`soft-stat-card col-span-6 ${
          view === 'sent' ? 'is-active' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="soft-icon-well">
            <Check />
          </span>
          {attentionCount > 0 && (
            <span className="text-[10px] font-medium danger-action">
              {attentionCount} need attention
            </span>
          )}
        </div>
        <div>
          <div className="soft-stat-number">
            {String(deliveredCount).padStart(2, '0')}
          </div>
          <div className="soft-stat-label mt-2">Delivered</div>
        </div>
      </button>

      {view === 'upcoming' && tasks.length > 1 && (
        <div className="col-span-12 soft-task-row">
          <span className="soft-icon-well">
            {activeCount > 0 ? <Pause /> : <Play />}
          </span>
          <div className="soft-row-copy">
            <div className="soft-row-title">Queue controls</div>
            <div className="soft-row-meta">
              {activeCount} active · {pausedCount} paused
            </div>
          </div>
          <button
            type="button"
            onClick={() => onPauseOrResumeAll(activeCount > 0)}
            className={`soft-pill ${activeCount === 0 ? 'text-ghost-accent' : ''}`}
          >
            {activeCount > 0 ? 'Pause all' : 'Resume all'}
          </button>
        </div>
      )}

      {view === 'upcoming' ? (
        tasks.length === 0 ? (
          <div className="col-span-12 bento-card p-10 text-center">
            <span className="soft-icon-well mx-auto mb-4">
              <Clock />
            </span>
            <div className="soft-section-title">No schedules</div>
            <p className="text-xs text-ghost-muted mt-2">
              Your next dispatch will appear here.
            </p>
          </div>
        ) : (
          tasks.map((task) => {
            const isBatch = Boolean(
              task.recipients && task.recipients.length > 1
            );
            const appTag =
              task.whatsappPackage === 'com.whatsapp.w4b'
                ? 'WA Business'
                : 'WhatsApp';
            const isRecurring = task.repeatMode !== 'once';
            const RowIcon = task.groupId ? Layers : isBatch ? Users : Clock;
            const messagePreview = isBatch
              ? `${task.recipients?.length ?? 0} personalized messages`
              : task.messageBody;

            return (
              <div
                key={task.id}
                className={`col-span-12 soft-task-row ${
                  task.enabled ? '' : 'is-paused'
                }`}
              >
                <span className="soft-icon-well">
                  <RowIcon />
                </span>

                <div className="soft-row-copy">
                  <div className="soft-row-title flex items-center gap-1.5">
                    <span className="truncate">{task.contactName}</span>
                    <span
                      className={`status-dot shrink-0 ${
                        task.enabled ? '' : 'is-muted'
                      }`}
                    />
                  </div>
                  <div className="soft-row-meta">
                    {formatTime24h(task.scheduledTime24)} · {appTag} ·{' '}
                    {isRecurring ? formatRepeatSummary(task) : 'Once'} · “
                    {messagePreview}”
                  </div>
                </div>

                <div className="soft-row-actions">
                  <button
                    type="button"
                    onClick={() => onPauseOrResumeTask(task.id)}
                    className={`soft-action-circle ${
                      task.enabled ? '' : 'is-active'
                    }`}
                    title={task.enabled ? 'Pause schedule' : 'Resume schedule'}
                    aria-label={task.enabled ? 'Pause schedule' : 'Resume schedule'}
                  >
                    {task.enabled ? <Pause /> : <Play />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRunTask(task)}
                    className="soft-action-circle"
                    title="Send now"
                    aria-label="Send now"
                  >
                    <Send />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    className="soft-action-circle danger-action"
                    title="Delete schedule"
                    aria-label="Delete schedule"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            );
          })
        )
      ) : history.length === 0 ? (
        <div className="col-span-12 bento-card p-10 text-center">
          <span className="soft-icon-well mx-auto mb-4">
            <Check />
          </span>
          <div className="soft-section-title">No deliveries</div>
          <p className="text-xs text-ghost-muted mt-2">
            Completed dispatches will appear here.
          </p>
        </div>
      ) : (
        history.map((item) => {
          const isSent = item.status === 'SENT';
          const isFailed = item.status === 'FAILED';
          return (
            <div key={item.id} className="col-span-12 soft-history-row">
              <span
                className={`soft-icon-well ${
                  isSent ? 'text-ghost-accent' : 'danger-action'
                }`}
              >
                {isSent ? <Check /> : isFailed ? <CircleAlert /> : <Pause />}
              </span>
              <div className="soft-row-copy">
                <div className="soft-row-title">{item.contactName}</div>
                <div className="soft-row-meta">
                  {item.sentAt} ·{' '}
                  {item.whatsappPackage === 'com.whatsapp.w4b'
                    ? 'WA Business'
                    : 'WhatsApp'}{' '}
                  · “{item.messageBody}”
                </div>
                {!isSent && item.detail && (
                  <div className="soft-failure-detail">{item.detail}</div>
                )}
              </div>
              <span
                className={`soft-pill ${
                  isSent ? 'text-ghost-accent' : 'danger-action'
                }`}
              >
                {isSent ? 'Sent' : isFailed ? 'Failed' : 'Stopped'}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
};
