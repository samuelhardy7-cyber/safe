import React, {useState} from 'react';
import {Lock, ShieldCheck, X} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';

interface ReauthModalProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export const ReauthModal: React.FC<ReauthModalProps> = ({
  open,
  title,
  description,
  onConfirm,
  onClose,
}) => {
  const {user, reauthenticateUser} = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !user) return null;

  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (hasPasswordProvider && !password) {
      setError('Masukkan kata sandi akun Anda saat ini.');
      return;
    }

    setSubmitting(true);
    try {
      await reauthenticateUser(hasPasswordProvider ? password : undefined);
      await onConfirm();
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autentikasi ulang gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-dialog-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EBF2FC] text-[#0F1E36] dark:bg-violet-950/60 dark:text-violet-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="reauth-dialog-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verifikasi ulang identitas sebelum melanjutkan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog verifikasi"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {description}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          {hasPasswordProvider ? (
            <div>
              <label
                htmlFor="reauth-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Kata Sandi Saat Ini
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="reauth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi Anda"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              Akun Anda terhubung melalui Google Sign-In ({user.email}). Klik tombol di bawah untuk
              mengonfirmasi ulang melalui jendela Google.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#0F1E36] px-4 py-2 text-sm font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              {submitting ? 'Memverifikasi...' : 'Verifikasi & Lanjutkan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
