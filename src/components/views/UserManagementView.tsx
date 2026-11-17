import React, {useCallback, useEffect, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  MailPlus,
  ShieldAlert,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {useChurch} from '../../contexts/ChurchContext';
import {
  ALLOWED_FINANCE_PERMISSIONS,
  canManageMember,
  getNormalizedFinancePermissions,
} from '../../domain/rbac';
import {
  createChurchInvitation,
  fetchChurchInvitations,
  fetchChurchMembers,
  revokeChurchInvitation,
  updateMemberRoleAndPermissions,
} from '../../services/churchService';
import type {
  ChurchInvitation,
  ChurchMembership,
  ChurchRole,
  FinancePermission,
  GranularFinancePermission,
  MembershipStatus,
} from '../../types/domain';
import {
  formatDateID,
  getFinancePermissionLabelID,
  getRoleLabelID,
  getStatusLabelID,
} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

const MANAGER_PRESET: GranularFinancePermission[] = [
  'finance.view',
  'finance.create',
  'finance.editDraft',
  'finance.submit',
  'finance.approve',
  'finance.reject',
  'finance.viewReports',
  'finance.viewReceipts',
  'finance.export',
];

const STAFF_PRESET: GranularFinancePermission[] = [
  'finance.view',
  'finance.create',
  'finance.editDraft',
  'finance.submit',
];

export const UserManagementView: React.FC = () => {
  const {activeChurch, activeMembership} = useChurch();

  const [members, setMembers] = useState<ChurchMembership[]>([]);
  const [invitations, setInvitations] = useState<ChurchInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<ChurchRole, 'owner'>>('finance_staff');
  const [inviteFinancePerms, setInviteFinancePerms] = useState<FinancePermission[]>(STAFF_PRESET);
  const [inviting, setInviting] = useState(false);

  // Edit member modal state
  const [editingMember, setEditingMember] = useState<ChurchMembership | null>(null);
  const [editRole, setEditRole] = useState<Exclude<ChurchRole, 'owner'>>('church_staff');
  const [editStatus, setEditStatus] = useState<MembershipStatus>('active');
  const [editFinancePerms, setEditFinancePerms] = useState<FinancePermission[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') return;
    setLoading(true);
    setError(null);
    try {
      const [mList, iList] = await Promise.all([
        fetchChurchMembers(activeChurch.id, activeMembership),
        fetchChurchInvitations(activeChurch.id, activeMembership),
      ]);
      setMembers(mList);
      setInvitations(iList);
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal memuat daftar pengguna gereja.'));
    } finally {
      setLoading(false);
    }
  }, [activeChurch, activeMembership]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300">
        Hanya Church Owner yang dapat mengelola pengguna dan hak akses gereja.
      </div>
    );
  }

  const toggleInvitePerm = (perm: FinancePermission) => {
    setInviteFinancePerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const toggleEditPerm = (perm: FinancePermission) => {
    setEditFinancePerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setInviting(true);
    try {
      await createChurchInvitation(activeChurch.id, activeChurch.name, activeMembership, {
        invitedEmail: inviteEmail,
        role: inviteRole,
        financePermissions: inviteRole === 'church_staff' ? [] : inviteFinancePerms,
        staffPermissions: ['dashboard:basic', 'church:view_profile'],
      });
      setNotice(`Undangan untuk ${inviteEmail.trim().toLowerCase()} berhasil dibuat.`);
      setInviteEmail('');
      await loadData();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal mengirim undangan.'));
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (invite: ChurchInvitation) => {
    setError(null);
    setNotice(null);
    try {
      await revokeChurchInvitation(activeChurch.id, activeMembership, invite);
      setNotice(`Undangan untuk ${invite.invitedEmail} telah dibatalkan.`);
      await loadData();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal membatalkan undangan.'));
    }
  };

  const openEditModal = (member: ChurchMembership) => {
    if (!canManageMember(activeMembership, member)) return;
    setEditingMember(member);
    setEditRole(member.role === 'owner' ? 'church_staff' : member.role);
    setEditStatus(member.status);
    setEditFinancePerms(getNormalizedFinancePermissions(member));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setError(null);
    setNotice(null);
    setSavingEdit(true);
    try {
      await updateMemberRoleAndPermissions(activeChurch.id, activeMembership, editingMember, {
        role: editRole,
        status: editStatus,
        financePermissions: editRole === 'church_staff' ? [] : editFinancePerms,
        staffPermissions: ['dashboard:basic', 'church:view_profile'],
      });
      setNotice(
        `Hak akses ${editingMember.email} berhasil diperbarui, disinkronkan secara real-time, dan dicatat di Audit Log.`,
      );
      setEditingMember(null);
      await loadData();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal memperbarui hak akses.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleQuickRevoke = async (member: ChurchMembership) => {
    if (!canManageMember(activeMembership, member)) return;
    setError(null);
    setNotice(null);
    try {
      await updateMemberRoleAndPermissions(activeChurch.id, activeMembership, member, {
        role: member.role === 'owner' ? 'church_staff' : member.role,
        status: 'revoked',
        financePermissions: [],
        staffPermissions: [],
      });
      setNotice(`Akses untuk ${member.email} telah dicabut secara langsung.`);
      await loadData();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal mencabut akses pengguna.'));
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Invite User Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <MailPlus className="h-5 w-5 text-violet-700 dark:text-violet-400" />
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Undang Pengguna ke {activeChurch.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hanya Church Owner yang dapat memberikan atau mencabut 13 izin keuangan granular.
              Data jemaat tidak pernah dibuka untuk peran selain Owner.
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleInviteSubmit(e)} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="invite-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Email Pengguna yang Diundang *
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="bendahara@gereja.org"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="invite-role"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Peran di Gereja Ini *
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => {
                  const next = e.target.value as Exclude<ChurchRole, 'owner'>;
                  setInviteRole(next);
                  if (next === 'church_staff') {
                    setInviteFinancePerms([]);
                  } else if (next === 'finance_manager') {
                    setInviteFinancePerms(MANAGER_PRESET);
                  } else {
                    setInviteFinancePerms(STAFF_PRESET);
                  }
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="finance_manager">Finance Manager (Keuangan Terotorisasi)</option>
                <option value="finance_staff">Finance Staff (Operasional Keuangan)</option>
                <option value="church_staff">Church Staff (Akses Dasar Tanpa Jemaat/Keuangan)</option>
              </select>
            </div>
          </div>

          {inviteRole !== 'church_staff' ? (
            <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="px-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  13 Izin Keuangan Granular (Tanpa Akses Data Jemaat)
                </legend>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteFinancePerms([...ALLOWED_FINANCE_PERMISSIONS])}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteFinancePerms(['finance.view', 'finance.viewReports'])}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Hanya Lihat &amp; Laporan
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteFinancePerms([])}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {ALLOWED_FINANCE_PERMISSIONS.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={inviteFinancePerms.includes(perm)}
                      onChange={() => toggleInvitePerm(perm)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-600"
                    />
                    <span>{getFinancePermissionLabelID(perm)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <ShieldAlert className="h-4 w-4 shrink-0 text-slate-500" />
              <span>
                Church Staff secara default tidak memiliki akses ke modul Jemaat maupun modul
                Keuangan.
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              {inviting ? 'Membuat Undangan...' : 'Kirim Undangan'}
            </button>
          </div>
        </form>
      </section>

      {/* Active & Historical Memberships Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <UserCheck className="h-5 w-5 text-[#0F1E36] dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Daftar Pengguna Gereja
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {members.length} akun
          </span>
        </div>

        {loading ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Pengguna</th>
                  <th className="py-2.5 pr-4 font-medium">Peran</th>
                  <th className="py-2.5 pr-4 font-medium">Izin Keuangan Granular</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((m) => {
                  const manageable = canManageMember(activeMembership, m);
                  const normalizedPerms = getNormalizedFinancePermissions(m);
                  return (
                    <tr key={m.uid} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {m.displayName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{m.email}</p>
                      </td>
                      <td className="py-3 pr-4 font-medium text-slate-800 dark:text-slate-200">
                        {getRoleLabelID(m.role)}
                      </td>
                      <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                        {m.role === 'owner'
                          ? 'Kendali Penuh Owner (13/13)'
                          : normalizedPerms.length > 0
                            ? `${normalizedPerms.length}/13 izin aktif (${normalizedPerms.slice(0, 3).join(', ')}${normalizedPerms.length > 3 ? '…' : ''})`
                            : 'Tidak ada'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`font-medium ${
                            m.status === 'active'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : m.status === 'suspended'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {getStatusLabelID(m.status)}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {manageable ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(m)}
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Ubah Izin
                            </button>
                            {m.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => void handleQuickRevoke(m)}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/50"
                              >
                                <UserX className="h-3 w-3" />
                                Cabut
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Owner Utama</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invitations History */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Riwayat Undangan
        </h2>
        {invitations.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Belum ada undangan yang diterbitkan.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Email Undangan</th>
                  <th className="py-2 pr-4 font-medium">Peran</th>
                  <th className="py-2 pr-4 font-medium">Berlaku Hingga</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-100">
                      {inv.invitedEmail}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">
                      {getRoleLabelID(inv.role)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500 tabular-nums dark:text-slate-400">
                      {formatDateID(inv.expiresAt, activeChurch.timezone)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">
                      {getStatusLabelID(inv.status)}
                    </td>
                    <td className="py-2.5 text-right">
                      {inv.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => void handleRevokeInvite(inv)}
                          className="rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300"
                        >
                          Batalkan
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-member-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="edit-member-title"
                  className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Ubah Peran &amp; Izin Keuangan — {editingMember.displayName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{editingMember.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                aria-label="Tutup modal ubah izin"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveEdit(e)} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-role"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Peran
                  </label>
                  <select
                    id="edit-role"
                    value={editRole}
                    onChange={(e) => {
                      const next = e.target.value as Exclude<ChurchRole, 'owner'>;
                      setEditRole(next);
                      if (next === 'church_staff') setEditFinancePerms([]);
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="finance_manager">Finance Manager</option>
                    <option value="finance_staff">Finance Staff</option>
                    <option value="church_staff">Church Staff</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="edit-status"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Status Keanggotaan
                  </label>
                  <select
                    id="edit-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as MembershipStatus)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="active">Aktif</option>
                    <option value="suspended">Ditangguhkan</option>
                    <option value="revoked">Dicabut</option>
                  </select>
                </div>
              </div>

              {editRole !== 'church_staff' && editStatus === 'active' && (
                <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="px-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      13 Izin Keuangan Granular
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditFinancePerms([...ALLOWED_FINANCE_PERMISSIONS])}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        Semua (13)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditFinancePerms(MANAGER_PRESET)}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        Preset Manager
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditFinancePerms(STAFF_PRESET)}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        Preset Staf
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditFinancePerms([])}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {ALLOWED_FINANCE_PERMISSIONS.map((perm) => (
                      <label
                        key={perm}
                        className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={editFinancePerms.includes(perm)}
                          onChange={() => toggleEditPerm(perm)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700"
                        />
                        <span>{getFinancePermissionLabelID(perm)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
                >
                  {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
