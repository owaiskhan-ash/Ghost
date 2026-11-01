import React from 'react';
import { Check, ShieldAlert, Square } from 'lucide-react';
import type { ExecutionReceipt } from '../types/ghost';

interface ReceiptsViewProps {
  receipts: ExecutionReceipt[];
}

export const ReceiptsView: React.FC<ReceiptsViewProps> = ({ receipts }) => {
  return (
    <div className="space-y-2.5 pb-4">
      {receipts.map((r) => {
        const isSent =
          r.outcome === 'SENT' || r.outcome === 'CHAIN_COMPLETED';
        const isPaused = r.outcome === 'PAUSED_CONTEXT_GUARD';

        return (
          <div
            key={r.id}
            className="rounded-3xl bg-ghost-surface border border-ghost-border p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ghost-ink truncate">
                  {r.contactName}
                </span>
                <span className="text-xs font-mono text-ghost-muted">
                  {r.executedAt}
                </span>
              </div>
              <div className="text-xs text-ghost-secondary truncate">
                "{r.messageText}"
              </div>
              <div className="text-[11px] text-ghost-muted truncate">
                {r.reasonDetail}
              </div>
            </div>

            <span
              className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                isSent
                  ? 'bg-ghost-recessed text-ghost-ink'
                  : 'bg-ghost-redSoft text-ghost-red'
              }`}
            >
              {isSent ? (
                <>
                  <Check className="w-3.5 h-3.5 text-ghost-red" /> Sent
                </>
              ) : isPaused ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" /> Paused
                </>
              ) : (
                <>
                  <Square className="w-3 h-3 fill-current" /> Stopped
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};
