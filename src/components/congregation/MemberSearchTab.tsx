import React, {useMemo, useState} from 'react';
import {Edit3, Eye, Search} from 'lucide-react';
import {filterAndSortMembers} from '../../domain/congregation';
import type {ChurchMembership, CongregationMember} from '../../types/domain';
import {getMemberStatusLabelID} from '../../utils/formatting';
import {MemberAvatar} from './MemberAvatar';

interface MemberSearchTabProps {
  churchId: string;
  churchName: string;
  membership: ChurchMembership;
  members: readonly CongregationMember[];
  onViewProfile: (member: CongregationMember) => void;
  onEditMember: (member: CongregationMember) => void;
}

export const MemberSearchTab: React.FC<MemberSearchTabProps> = ({
  churchId,
  churchName,
  membership,
  members,
  onViewProfile,
  onEditMember,
}) => {
  const [queryText, setQueryText] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  const results = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    const pool = includeArchived
      ? [
          ...filterAndSortMembers(members, {search: q, archived: false}),
          ...filterAndSortMembers(members, {search: q, archived: true}),
        ]
      : filterAndSortMembers(members, {search: q, archived: false});
    return pool;
  }, [members, queryText, includeArchived]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Pencarian Jemaat Terisolasi
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Pencarian dijalankan khusus pada ruang kerja{' '}
          <strong className="text-slate-800 dark:text-slate-200">{churchName}</strong> (ID:{' '}
          <span className="font-mono">{churchId}</span>). Tidak pernah mencampur data lintas gereja.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Ketik nama lengkap, panggilan, kode JMT-..., nomor telepon, email, atau nama keluarga..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-900 focus:border-[#0F1E36] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:bg-slate-950"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900"
            />
            Sertakan data diarsipkan
          </label>
        </div>
      </section>

      {!queryText.trim() ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Masukkan minimal 1 kata kunci untuk mencari data jemaat gereja ini.
        </section>
      ) : results.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Tidak ada jemaat yang cocok dengan kata kunci &ldquo;{queryText.trim()}&rdquo;.
        </section>
      ) : (
        <section className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {results.map((m) => (
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
                    {m.archived && (
                      <span className="ml-2 font-normal text-amber-800 dark:text-amber-300">
                        (Diarsipkan)
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{m.memberCode}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{getMemberStatusLabelID(m.status)}</span>
                    {m.familyGroupName && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{m.familyGroupName}</span>
                      </>
                    )}
                    {m.phone && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{m.phone}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
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
                  onClick={() => onEditMember(m)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Ubah
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
