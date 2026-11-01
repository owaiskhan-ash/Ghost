import React from 'react';
import { Check, Download, Smartphone, X } from 'lucide-react';
import type { ApkMetadata } from '../types/ghost';

interface ApkStudioModalProps {
  meta: ApkMetadata | null;
  onClose: () => void;
}

export const ApkStudioModal: React.FC<ApkStudioModalProps> = ({
  meta,
  onClose,
}) => {
  const version = meta?.versionName || '1.1.0';
  const fileName = meta?.fileName || `Ghost-v${version}.apk`;
  const sizeLabel = meta?.sizeBytes
    ? `${(meta.sizeBytes / 1024).toFixed(0)} KB`
    : 'Ready';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ghost-ink/40 backdrop-blur-sm p-3">
      <div className="w-full max-w-sm rounded-3xl bg-ghost-surface border border-ghost-border shadow-2xl overflow-hidden p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-ghost-red text-white flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ghost-ink">
                Ghost v{version} APK
              </h2>
              <p className="text-xs text-ghost-muted">
                Signed · {sizeLabel} · Android 8+
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-ghost-recessed text-ghost-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <a
          href={`/downloads/${fileName}`}
          download={fileName}
          className="w-full py-3 rounded-2xl bg-ghost-red hover:bg-ghost-redHover text-white font-bold text-xs shadow-neon transition flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download {fileName}
        </a>

        <div className="rounded-2xl bg-ghost-canvas p-3.5 space-y-2 text-xs text-ghost-secondary">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-ghost-red shrink-0" />
            <span>1. Install APK on Android</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-ghost-red shrink-0" />
            <span>2. Enable Ghost in Accessibility</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-ghost-red shrink-0" />
            <span>3. Schedule your 5 AM message</span>
          </div>
        </div>
      </div>
    </div>
  );
};
