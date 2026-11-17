import React, {useState} from 'react';
import {AlertCircle, Building2, Check, LogOut, MailPlus, Shield} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {useChurch} from '../../contexts/ChurchContext';
import {createChurchWorkspace} from '../../services/churchService';
import type {CurrencyCode, LanguageCode} from '../../types/domain';
import {getRoleLabelID} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface ChurchOnboardingProps {
  onCancel?: () => void;
  allowCancel?: boolean;
}

export const ChurchOnboarding: React.FC<ChurchOnboardingProps> = ({
  onCancel,
  allowCancel = false,
}) => {
  const {user, account, logout} = useAuth();
  const {pendingInvitations, selectChurch, acceptInvite} = useChurch();

  const [name, setName] = useState('');
  const [denomination, setDenomination] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Indonesia');
  const [currency, setCurrency] = useState<CurrencyCode>('IDR');
  const [language, setLanguage] = useState<LanguageCode>('id');
  const [timezone, setTimezone] = useState('Asia/Jakarta');

  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !account) return;
    setError(null);
    setSubmitting(true);
    try {
      const churchId = await createChurchWorkspace(user, account, {
        name,
        denomination,
        city,
        country,
        timezone,
        currency,
        language,
      });
      await selectChurch(churchId);
      if (onCancel) onCancel();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal membuat ruang kerja gereja.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    const invite = pendingInvitations.find((i) => i.id === inviteId);
    if (!invite) return;
    setError(null);
    setAcceptingId(inviteId);
    try {
      await acceptInvite(invite);
      if (onCancel) onCancel();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal menerima undangan gereja.'));
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F1E36] text-amber-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Higayon Church Management
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Masuk sebagai {account?.displayName || user?.email}
                <span aria-hidden="true"> · </span>
                {user?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {allowCancel && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Kembali ke Ruang Kerja
              </button>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              Keluar
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Pending Invitations Section */}
        {pendingInvitations.length > 0 && (
          <section className="mt-8 rounded-xl border border-violet-200 bg-white p-6 dark:border-violet-800/70 dark:bg-slate-900">
            <div className="flex items-center gap-2.5">
              <MailPlus className="h-5 w-5 text-violet-700 dark:text-violet-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Undangan Gereja Menunggu Konfirmasi ({pendingInvitations.length})
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Anda diundang untuk bergabung ke ruang kerja gereja berikut dengan hak akses terbatas
              sesuai ketentuan Owner.
            </p>

            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {pendingInvitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {invite.churchName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Peran:{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {getRoleLabelID(invite.role)}
                      </span>
                      <span aria-hidden="true"> · </span>
                      ID: <span className="font-mono">{invite.churchId}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={acceptingId === invite.id}
                    onClick={() => void handleAcceptInvite(invite.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {acceptingId === invite.id ? 'Memproses...' : 'Terima Undangan'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Create New Church Workspace */}
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EBF2FC] text-[#0F1E36] dark:bg-violet-950/60 dark:text-violet-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Buat Ruang Kerja Gereja Baru
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Anda akan ditetapkan sebagai <strong>Church Owner</strong> untuk gereja ini dengan
                isolasi data terpisah, audit log khusus, dan kendali penuh atas izin staf.
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleCreate(e)} className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="church-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Nama Resmi Gereja *
              </label>
              <input
                id="church-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: GKI Kemuliaan Jakarta Selatan"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="church-denom"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Sinode / Denominasi (Opsional)
              </label>
              <input
                id="church-denom"
                type="text"
                value={denomination}
                onChange={(e) => setDenomination(e.target.value)}
                placeholder="Contoh: Sinode Kristen Indonesia"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="church-city"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Kota / Kabupaten *
              </label>
              <input
                id="church-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Jakarta Selatan"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="church-country"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Negara *
              </label>
              <input
                id="church-country"
                type="text"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="church-timezone"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Zona Waktu
              </label>
              <select
                id="church-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="church-currency"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Mata Uang Utama
              </label>
              <select
                id="church-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="IDR">Rupiah Indonesia (IDR)</option>
                <option value="USD">US Dollar (USD)</option>
                <option value="SGD">Singapore Dollar (SGD)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="church-language"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Bahasa Default
              </label>
              <select
                id="church-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English (Persiapan Multi-Bahasa)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 sm:col-span-2 dark:border-slate-800">
              {allowCancel && onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#0F1E36] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                {submitting ? 'Membuat Ruang Kerja...' : 'Buat Ruang Kerja Gereja'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};
