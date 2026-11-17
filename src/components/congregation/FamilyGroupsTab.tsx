import React, {useState} from 'react';
import {FolderHeart, Plus, Unlink, UserPlus} from 'lucide-react';
import {
  assignMemberToFamily,
  createFamilyGroup,
} from '../../services/congregationService';
import type {
  ChurchMembership,
  CongregationMember,
  FamilyGroup,
  FamilyRole,
} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {getFamilyRoleLabelID} from '../../utils/formatting';

interface FamilyGroupsTabProps {
  churchId: string;
  membership: ChurchMembership;
  members: readonly CongregationMember[];
  families: readonly FamilyGroup[];
  onViewProfile: (member: CongregationMember) => void;
  onRefresh: () => Promise<void>;
}

const ROLES: Exclude<FamilyRole, ''>[] = ['head', 'spouse', 'child', 'parent', 'other'];

export const FamilyGroupsTab: React.FC<FamilyGroupsTabProps> = ({
  churchId,
  membership,
  members,
  families,
  onViewProfile,
  onRefresh,
}) => {
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(families[0]?.id || '');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [assignRole, setAssignRole] = useState<Exclude<FamilyRole, ''>>('head');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeFamilies = families.filter((f) => !f.archived);
  const activeMembers = members.filter((m) => !m.archived);
  const currentFamily =
    activeFamilies.find((f) => f.id === selectedFamilyId) || activeFamilies[0] || null;

  const familyMembers = currentFamily
    ? activeMembers.filter((m) => m.familyGroupId === currentFamily.id)
    : [];

  const availableMembersToLink = currentFamily
    ? activeMembers.filter((m) => m.familyGroupId !== currentFamily.id)
    : [];

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const id = await createFamilyGroup(
        churchId,
        membership,
        {name: newName, notes: newNotes},
        families,
      );
      setNewName('');
      setNewNotes('');
      setSelectedFamilyId(id);
      await onRefresh();
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal membuat kelompok keluarga.'));
    } finally {
      setBusy(false);
    }
  };

  const handleLinkMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFamily || !assignMemberId || busy) return;
    const member = activeMembers.find((m) => m.id === assignMemberId);
    if (!member) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await assignMemberToFamily(churchId, membership, member, currentFamily, assignRole);
      setAssignMemberId('');
      await onRefresh();
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal menghubungkan anggota.'));
    } finally {
      setBusy(false);
    }
  };

  const handleChangeRole = async (member: CongregationMember, role: Exclude<FamilyRole, ''>) => {
    if (!currentFamily || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await assignMemberToFamily(churchId, membership, member, currentFamily, role);
      await onRefresh();
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal mengubah peran keluarga.'));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (member: CongregationMember) => {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await assignMemberToFamily(churchId, membership, member, null, '');
      await onRefresh();
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal melepaskan anggota dari keluarga.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Create + Family List */}
        <div className="space-y-4">
          <form
            onSubmit={(e) => void handleCreateFamily(e)}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Buat Kelompok Keluarga Baru
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nama Keluarga <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Keluarga Bpk. Yohanes Santoso"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Catatan Wilayah / Keterangan (Opsional)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Contoh: Sektor Timur"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
                />
              </div>
              <button
                type="submit"
                disabled={busy || newName.trim().length < 2}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F1E36] px-3 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Buat Kelompok Keluarga
              </button>
            </div>
          </form>

          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="px-1 font-display text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Daftar Keluarga ({activeFamilies.length})
            </h3>
            {activeFamilies.length === 0 ? (
              <p className="mt-3 px-1 text-xs text-slate-500 dark:text-slate-400">
                Belum ada kelompok keluarga yang dibuat.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {activeFamilies.map((fam) => {
                  const count = activeMembers.filter((m) => m.familyGroupId === fam.id).length;
                  const active = currentFamily?.id === fam.id;
                  return (
                    <li key={fam.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedFamilyId(fam.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs ${
                          active
                            ? 'bg-[#EBF2FC] text-[#0F1E36] dark:bg-violet-950/60 dark:text-violet-200'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{fam.name}</p>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {fam.familyCode}
                          </p>
                        </div>
                        <span className="font-mono text-[11px] font-medium tabular-nums">
                          {count} jiwa
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right: Active Family Detail & Member Linking */}
        <div className="lg:col-span-2">
          {!currentFamily ? (
            <section className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
              <FolderHeart className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
              <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Pilih atau Buat Kelompok Keluarga
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Anda dapat menghubungkan anggota jemaat, menentukan Kepala Keluarga, memindahkan,
                atau melepas relasi tanpa menghapus profil jemaat.
              </p>
            </section>
          ) : (
            <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="font-mono text-xs text-violet-700 dark:text-violet-400">
                  {currentFamily.familyCode}
                </p>
                <h2 className="mt-0.5 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {currentFamily.name}
                </h2>
                {currentFamily.notes && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {currentFamily.notes}
                  </p>
                )}
              </div>

              {/* Link Member Form */}
              <form
                onSubmit={(e) => void handleLinkMember(e)}
                className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3.5 dark:bg-slate-950/60"
              >
                <div className="min-w-[180px] flex-1">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    Hubungkan / Pindahkan Anggota ke Keluarga Ini
                  </label>
                  <select
                    value={assignMemberId}
                    onChange={(e) => setAssignMemberId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Pilih anggota jemaat...</option>
                    {availableMembersToLink.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} ({m.memberCode})
                        {m.familyGroupName ? ` — saat ini: ${m.familyGroupName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-40">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    Peran
                  </label>
                  <select
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value as Exclude<FamilyRole, ''>)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {getFamilyRoleLabelID(r)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!assignMemberId || busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Hubungkan
                </button>
              </form>

              {/* Family Members List */}
              {familyMembers.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Belum ada anggota dalam kelompok keluarga ini.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  {familyMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => onViewProfile(m)}
                          className="font-semibold text-slate-900 hover:text-violet-700 hover:underline dark:text-slate-100 dark:hover:text-violet-400"
                        >
                          {m.fullName}
                        </button>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{m.memberCode}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{m.phone || 'Tanpa telepon'}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Peran keluarga ${m.fullName}`}
                          value={m.familyRole || 'other'}
                          disabled={busy}
                          onChange={(e) =>
                            void handleChangeRole(m, e.target.value as Exclude<FamilyRole, ''>)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {getFamilyRoleLabelID(r)}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleUnlink(m)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                          Lepas
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
