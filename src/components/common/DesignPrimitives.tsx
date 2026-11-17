import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react';

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
  className?: string;
}

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success:
    'border-teal-200 bg-teal-50/70 text-teal-800 dark:border-teal-800/70 dark:bg-teal-950/40 dark:text-teal-300',
  warning:
    'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300',
  danger:
    'border-rose-200 bg-rose-50/70 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300',
  info:
    'border-violet-200 bg-violet-50/70 text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-300',
  neutral:
    'border-slate-200 bg-slate-100/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function renderVariantIcon(variant: StatusVariant) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case 'warning':
      return <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case 'danger':
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case 'info':
      return <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case 'neutral':
      return <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({variant, label, className = ''}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap shrink-0 ${VARIANT_CLASSES[variant]} ${className}`}
  >
    {renderVariantIcon(variant)}
    <span>{label}</span>
  </span>
);

export type EmptyIllustrationKind =
  | 'no-transactions'
  | 'no-data'
  | 'backup-success'
  | 'offline'
  | 'access-denied';

interface EmptyStateIllustrationProps {
  kind: EmptyIllustrationKind;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyStateIllustration: React.FC<EmptyStateIllustrationProps> = ({
  kind,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const accentColor =
    kind === 'backup-success'
      ? 'text-teal-700 dark:text-teal-400'
      : kind === 'offline'
        ? 'text-amber-700 dark:text-amber-400'
        : kind === 'access-denied'
          ? 'text-rose-700 dark:text-rose-400'
          : 'text-[#0F1E36] dark:text-violet-400';

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
      <svg
        viewBox="0 0 120 72"
        className={`h-16 w-28 ${accentColor}`}
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="16"
          y="10"
          width="88"
          height="52"
          rx="8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />
        <line
          x1="28"
          y1="24"
          x2="92"
          y2="24"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.25"
        />
        {kind === 'no-transactions' && (
          <>
            <rect
              x="28"
              y="33"
              width="28"
              height="6"
              rx="2"
              fill="currentColor"
              fillOpacity="0.18"
            />
            <rect
              x="64"
              y="33"
              width="28"
              height="6"
              rx="2"
              fill="currentColor"
              fillOpacity="0.32"
            />
            <rect
              x="28"
              y="45"
              width="44"
              height="6"
              rx="2"
              fill="currentColor"
              fillOpacity="0.15"
            />
          </>
        )}
        {kind === 'no-data' && (
          <>
            <circle cx="60" cy="42" r="11" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.45" />
            <path d="M56 42h8M60 38v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
        {kind === 'backup-success' && (
          <>
            <circle cx="60" cy="42" r="12" fill="currentColor" fillOpacity="0.12" />
            <path
              d="M54 42l4 4 8-8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {kind === 'offline' && (
          <>
            <path
              d="M46 46a20 20 0 0128 0M52 51a12 12 0 0116 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="M44 34l32 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </>
        )}
        {kind === 'access-denied' && (
          <>
            <rect
              x="51"
              y="38"
              width="18"
              height="14"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M55 38v-4a5 5 0 0110 0v4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>

      <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

interface ToastBannerProps {
  tone: 'error' | 'success' | 'warning';
  message: string;
  onDismiss?: () => void;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({tone, message, onDismiss}) => {
  const styles =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200'
      : tone === 'success'
        ? 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900/70 dark:bg-teal-950/50 dark:text-teal-200'
        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200';

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-xs ${styles}`}
    >
      <div className="flex items-start gap-2.5">
        {tone === 'error' ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : tone === 'success' ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span className="leading-relaxed">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan"
          className="rounded p-0.5 opacity-70 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Batal',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <h3
          id="confirm-dialog-title"
          className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {title}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {description}
        </p>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-60 ${
              destructive
                ? 'bg-rose-700 hover:bg-rose-600'
                : 'bg-[#0F1E36] hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600'
            }`}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const SectionSkeleton: React.FC<{rows?: number}> = ({rows = 3}) => (
  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
    <div className="h-5 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
    {Array.from({length: rows}).map((_, idx) => (
      <div key={idx} className="h-10 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
    ))}
  </div>
);
