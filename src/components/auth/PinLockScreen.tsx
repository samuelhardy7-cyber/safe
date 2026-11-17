import React, {useState} from 'react';
import {AlertCircle, LockKeyhole, LogOut} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';

export const PinLockScreen: React.FC = () => {
  const {account, unlockWithPin, logout} = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError('Masukkan 6 digit PIN aplikasi Anda.');
      return;
    }
    setChecking(true);
    try {
      const ok = await unlockWithPin(pin);
      if (!ok) {
        setError('PIN aplikasi tidak sesuai.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#EBF2FC] text-[#0F1E36] dark:bg-violet-950/60 dark:text-violet-300">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="mt-5 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          Sesi Terkunci dengan PIN
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Masukkan PIN 6 digit untuk membuka sesi lokal akun{' '}
          <strong className="text-slate-900 dark:text-slate-100">{account?.displayName}</strong>.
          PIN ini adalah lapisan pengaman tambahan di atas autentikasi Firebase.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="unlock-pin-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              PIN Aplikasi (6 Digit)
            </label>
            <input
              id="unlock-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              autoFocus
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={checking}
            className="w-full rounded-lg bg-[#0F1E36] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            {checking ? 'Memeriksa...' : 'Buka Sesi'}
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar &amp; Autentikasi Ulang
          </button>
        </form>
      </div>
    </div>
  );
};
