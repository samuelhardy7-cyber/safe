import React, {useState} from 'react';
import {Archive, Eye, RotateCcw} from 'lucide-react';
import type {ChurchMembership, CongregationMember} from '../../types/domain';
import {formatDateTimeID, getMemberStatusLabelID} from '../../utils/formatting';
import {MemberAvatar} from './MemberAvatar';

interface ArchivedMembersTabProps {
  churchId: string;
  timezone: string;
  membership: ChurchMembership;
  members: readonly CongregationMember[];
  onViewProfile: (member: CongregationMember) => void;
  onRestoreMember: (member: CongregationMember) => Promise<void>;
}

export const ArchivedMembersTab: React.FC<ArchivedMembersTabProps> = ({
  churchId,
  timezone,
  membership,
  members,
  onViewProfile,
  onRestoreMember,
}) => {
  const [confirmRestore, setConfirmRestore] = useState<CongregationMember | null>(null);
  const [busy, setBusy] = useState(false);

  const archivedList = members.filter((m) => m.archived);

  const handleRestore = async () => {
    if (!confirmRestore || busy) return;
    setBusy(true);
    try {
      await onRestoreMember(confirmRestore);
      setConfirmRestore(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <Archive className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Arsip Data Jemaat ({archivedList.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Data jemaat yang diarsipkan tidak dihapus secara permanen dan dapat dipulihkan kembali ke direktori aktif.
            </p>
          </div>
        </div>
      </section>

      {confirmRestore && (
        <section
          role="alertdialog"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs dark:border-emerald-800/80 dark:bg-emerald-950/40"
        >
          <p className="text-emerald-950 dark:text-emerald-100">
            Pulihkan profil <strong>{confirmRestore.fullName}</strong> (
            <span className="font-mono">{confirmRestore.memberCode}</span>) ke Direktori Jemaat
            aktif?
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmRestore(null)}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-medium text-emerald-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRestore()}
              className="rounded-lg bg-[#0F1E36] px-3 py-1.5 font-medium text-white dark:bg-violet-700"
            >
              {busy ? 'Memulihkan...' : 'Ya, Pulihkan'}
            </button>
          </div>
        </section>
      )}

      {archivedList.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Tidak ada profil jemaat yang diarsipkan pada ruang kerja gereja ini.
        </section>
      ) : (
        <section className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {archivedList.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <MemberAvatar
                  churchId={churchId}
                  membership={membership}
                  fullName={m.fullName}
                  photoPath={m.photoPath}
                  sizeClass="h-10 w-10"
                />
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {m.fullName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{m.memberCode}</span>
                    <span aria-hidden="true"> · </span>
                    <span>Status terakhir: {getMemberStatusLabelID(m.status)}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="tabular-nums">
                      Diarsipkan: {formatDateTimeID(m.archivedAt || m.updatedAt, timezone)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onViewProfile(m)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Profil
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestore(m)}
                  className="inline-flex items-center gap-1 rounded-md bg-[#0F1E36] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Pulihkan
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
