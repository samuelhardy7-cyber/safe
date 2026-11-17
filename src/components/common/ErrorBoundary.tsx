import React from 'react';
import {AlertTriangle, RefreshCw} from 'lucide-react';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, error: null};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {hasError: true, error};
  }

  override render() {
    if (this.state.hasError) {
      const message = extractUserErrorMessage(
        this.state.error,
        'Terjadi kesalahan tak terduga saat memuat aplikasi.',
      );
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h2 className="text-base font-semibold">Gangguan Sistem Aplikasi</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2 text-sm font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <RefreshCw className="h-4 w-4" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
