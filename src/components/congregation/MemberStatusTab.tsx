import React, {useState} from 'react';
import {CheckCircle2, Save, SlidersHorizontal} from 'lucide-react';
import {
  ALLOWED_MEMBER_STATUSES,
  CONFIGURABLE_MEMBER_FIELDS,
  DEFAULT_REQUIRED_FIELDS,
} from '../../domain/congregation';
import {
  saveCongregationRequiredFields,
  updateCongregationMemberStatus,
} from '../../services/congregationService';
import type {
  ChurchMembership,
  CongregationMember,
  CongregationMemberStatus,
  CongregationRequiredField,
} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {
  getMemberStatusLabelID,
  getRequiredFieldLabelID,
} from '../../utils/formatting';

interface MemberStatusTabProps {
  churchId: string;
  membership: ChurchMembership;
  members: readonly CongregationMember[];
  requiredFields: CongregationRequiredField[];
  onRefresh: () => Promise<void>;
}

export const MemberStatusTab: React.FC<MemberStatusTabProps> = ({
  churchId,
  membership,
  members,
  requiredFields,
  onRefresh,
}) => {
  const [selectedFields, setSelectedFields] = useState<CongregationRequiredField[]>(requiredFields);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [nextStatus, setNextStatus] = useState<CongregationMemberStatus>('active');
  const [statusNote, setStatusNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nonArchived = members.filter((m) => !m.archived);

  const toggleField = (field: CongregationRequiredField) => {
    if (DEFAULT_REQUIRED_FIELDS.includes(field)) return; // fullName and status always required
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  };

  const handleSaveFields = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      await saveCongregationRequiredFields(churchId, membership, selectedFields);
      await onRefresh();
      setMessage('Kebijakan field wajib profil jemaat berhasil disimpan.');
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal menyimpan kebijakan field wajib.'));
    } finally {
      setBusy(false);
    }
  };

  const handleQuickStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId || busy) return;
    const member = nonArchived.find((m) => m.id === selectedMemberId);
    if (!member) return;
    setBusy(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      await updateCongregationMemberStatus(churchId, membership, member, nextStatus, statusNote);
      setStatusNote('');
      await onRefresh();
      setMessage(`Status ${member.fullName} berhasil diperbarui.`);
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal memperbarui status anggota.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Status Counts */}
      <div className="grid gap-4 sm:grid-cols-5">
        {ALLOWED_MEMBER_STATUSES.map((st) => {
          const count = nonArchived.filter((m) => m.status === st).length;
          return (
            <div
              key={st}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {getMemberStatusLabelID(st)}
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {count}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Status Transition */}
        <form
          onSubmit={(e) => void handleQuickStatusUpdate(e)}
          className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Pembaruan Status Keanggotaan Cepat
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Setiap perubahan status tercatat otomatis ke riwayat aktivitas jemaat gereja.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Pilih Anggota
              </label>
              <select
                value={selectedMemberId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedMemberId(id);
                  const found = nonArchived.find((m) => m.id === id);
                  if (found) setNextStatus(found.status);
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
              >
                <option value="">Pilih anggota...</option>
                {nonArchived.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.memberCode}) — {getMemberStatusLabelID(m.status)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Status Baru
              </label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as CongregationMemberStatus)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
              >
                {ALLOWED_MEMBER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {getMemberStatusLabelID(st)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Catatan Perubahan (Opsional)
              </label>
              <input
                type="text"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Mis. Pindah domisili kerja"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
              />
            </div>

            <button
              type="submit"
              disabled={!selectedMemberId || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <Save className="h-3.5 w-3.5" />
              Perbarui Status
            </button>
          </div>
        </form>

        {/* Owner-configurable Required Fields */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-violet-700 dark:text-violet-400" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Kebijakan Field Wajib Formulir Jemaat
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Prinsip minimisasi data: pilih hanya informasi yang benar-benar dibutuhkan gereja Anda.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {CONFIGURABLE_MEMBER_FIELDS.map((field) => {
              const locked = DEFAULT_REQUIRED_FIELDS.includes(field);
              const checked = selectedFields.includes(field) || locked;
              return (
                <label
                  key={field}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs ${
                    checked
                      ? 'border-[#0F1E36]/30 bg-[#EBF2FC]/60 text-slate-900 dark:border-violet-600/60 dark:bg-violet-950/40 dark:text-violet-100'
                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggleField(field)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#0F1E36] dark:border-slate-600 dark:bg-slate-900"
                  />
                  <span>
                    {getRequiredFieldLabelID(field)}
                    {locked && (
                      <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400">
                        (Dasar)
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSaveFields()}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            <Save className="h-3.5 w-3.5" />
            Simpan Kebijakan Formulir
          </button>
        </section>
      </div>
    </div>
  );
};
