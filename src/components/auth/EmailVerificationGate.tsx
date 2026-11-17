import React, {useState} from 'react';
import {AlertCircle, CheckCircle2, LogOut, MailCheck, RefreshCw} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';

export const EmailVerificationGate: React.FC = () => {
  const {user, sendVerificationEmailAgain, reloadVerificationStatus, logout} = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleResend = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await sendVerificationEmailAgain();
      setMessage(`Email verifikasi baru telah dikirim ke ${user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim ulang email verifikasi.');
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const verified = await reloadVerificationStatus();
      if (!verified) {
        setError('Status email masih belum terverifikasi. Klik tautan di kotak masuk Anda terlebih dahulu.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa status verifikasi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#EBF2FC] text-[#0F1E36] dark:bg-violet-950/60 dark:text-violet-300">
          <MailCheck className="h-5 w-5" />
        </div>

        <h1 className="mt-5 font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
          Verifikasi Email Diperlukan
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Demi keamanan data jemaat dan keuangan gereja, akun{' '}
          <strong className="text-slate-900 dark:text-slate-100">{user.email}</strong> wajib
          diverifikasi sebelum dapat membuat ruang kerja gereja atau menerima undangan.
        </p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCheck()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            <RefreshCw className="h-4 w-4" />
            Saya Sudah Verifikasi (Periksa Status)
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleResend()}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Kirim Ulang Tautan Verifikasi
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar dan Gunakan Akun Lain
          </button>
        </div>
      </div>
    </div>
  );
};
