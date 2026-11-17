import React, {useMemo, useState} from 'react';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  LayoutGrid,
  List,
  Plus,
  Search,
} from 'lucide-react';
import {
  ALLOWED_MEMBER_STATUSES,
  filterAndSortMembers,
  type MemberSortOrder,
} from '../../domain/congregation';
import type {
  ChurchMembership,
  CongregationMember,
  CongregationMemberStatus,
  FamilyGroup,
} from '../../types/domain';
import {getMemberStatusLabelID} from '../../utils/formatting';
import {MemberAvatar} from './MemberAvatar';

interface MemberDirectoryTabProps {
  churchId: string;
  membership: ChurchMembership;
  members: readonly CongregationMember[];
  families: readonly FamilyGroup[];
  onCreateNew: () => void;
  onViewProfile: (member: CongregationMember) => void;
  onEditMember: (member: CongregationMember) => void;
  onArchiveMember: (member: CongregationMember) => Promise<void>;
}

function getStatusTextClass(status: CongregationMemberStatus): string {
  switch (status) {
    case 'active':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'inactive':
      return 'text-slate-600 dark:text-slate-400';
    case 'visiting':
      return 'text-violet-700 dark:text-violet-400';
    case 'moved':
      return 'text-amber-700 dark:text-amber-400';
    case 'deceased':
      return 'text-rose-700 dark:text-rose-400';
  }
}

export const MemberDirectoryTab: React.FC<MemberDirectoryTabProps> = ({
  churchId,
  membership,
  members,
  families,
  onCreateNew,
  onViewProfile,
  onEditMember,
  onArchiveMember,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CongregationMemberStatus | 'all'>('all');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<MemberSortOrder>('name_asc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [confirmArchiveMember, setConfirmArchiveMember] = useState<CongregationMember | null>(null);
  const [archiving, setArchiving] = useState(false);

  const filtered = useMemo(
    () =>
      filterAndSortMembers(members, {
        search,
        status: statusFilter,
        familyGroupId: familyFilter,
        archived: false,
        sortBy,
      }),
    [members, search, statusFilter, familyFilter, sortBy],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleConfirmArchive = async () => {
    if (!confirmArchiveMember || archiving) return;
    setArchiving(true);
    try {
      await onArchiveMember(confirmArchiveMember);
      setConfirmArchiveMember(null);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari nama, panggilan, kode anggota, telepon..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-[#0F1E36] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:bg-slate-950"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter status keanggotaan"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CongregationMemberStatus | 'all');
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-violet-500"
            >
              <option value="all">Semua Status</option>
              {ALLOWED_MEMBER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {getMemberStatusLabelID(st)}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter kelompok keluarga"
              value={familyFilter}
              onChange={(e) => {
                setFamilyFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-violet-500"
            >
              <option value="all">Semua Keluarga</option>
              <option value="__none__">Belum Terhubung Keluarga</option>
              {families
                .filter((f) => !f.archived)
                .map((fam) => (
                  <option key={fam.id} value={fam.id}>
                    {fam.name}
                  </option>
                ))}
            </select>

            <select
              aria-label="Urutkan daftar jemaat"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as MemberSortOrder)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-violet-500"
            >
              <option value="name_asc">Nama A–Z</option>
              <option value="name_desc">Nama Z–A</option>
              <option value="joined_desc">Tanggal Bergabung Terbaru</option>
              <option value="updated_desc">Terakhir Diperbarui</option>
            </select>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  viewMode === 'table'
                    ? 'bg-white text-[#0F1E36] shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                aria-label="Tampilan tabel"
              >
                <List className="h-3.5 w-3.5" />
                Tabel
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  viewMode === 'card'
                    ? 'bg-white text-[#0F1E36] shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                aria-label="Tampilan kartu"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kartu
              </button>
            </div>

            <button
              type="button"
              onClick={onCreateNew}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Jemaat
            </button>
          </div>
        </div>
      </section>

      {/* Inline Archive Confirmation */}
      {confirmArchiveMember && (
        <section
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/80 dark:bg-amber-950/40"
          role="alertdialog"
          aria-labelledby="archive-confirm-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3
                id="archive-confirm-title"
                className="text-xs font-semibold text-amber-950 dark:text-amber-100"
              >
                Konfirmasi Pengarsipan Profil Jemaat
              </h3>
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                Profil <strong>{confirmArchiveMember.fullName}</strong> (
                <span className="font-mono">{confirmArchiveMember.memberCode}</span>) akan
                dipindahkan ke Arsip Jemaat dan tetap tersimpan aman untuk dipulihkan kapan saja.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={archiving}
                onClick={() => setConfirmArchiveMember(null)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={() => void handleConfirmArchive()}
                className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                {archiving ? 'Mengarsipkan...' : 'Ya, Arsipkan'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Empty State */}
      {filtered.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Belum Ada Data Jemaat yang Cocok
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tambahkan profil jemaat baru, ubah kata kunci pencarian, atau impor data CSV/Excel.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Jemaat Pertama
          </button>
        </section>
      ) : viewMode === 'table' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Anggota</th>
                  <th className="px-4 py-3">Kontak</th>
                  <th className="px-4 py-3">Keluarga</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tgl Mulai</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <MemberAvatar
                          churchId={churchId}
                          membership={membership}
                          fullName={m.fullName}
                          photoPath={m.photoPath}
                          sizeClass="h-9 w-9"
                        />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onViewProfile(m)}
                            className="block truncate text-left font-medium text-slate-900 hover:text-violet-700 hover:underline dark:text-slate-100 dark:hover:text-violet-400"
                          >
                            {m.fullName}
                          </button>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{m.memberCode}</span>
                            {m.nickname && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>{m.nickname}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <p className="font-mono text-[11px]">{m.phone || '—'}</p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {m.email || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {m.familyGroupName || (
                        <span className="text-slate-400 dark:text-slate-500">Belum terhubung</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${getStatusTextClass(m.status)}`}>
                        {getMemberStatusLabelID(m.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                      {m.joinedDate || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewProfile(m)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-3 w-3" />
                          Profil
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditMember(m)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="h-3 w-3" />
                          Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmArchiveMember(m)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-50 dark:border-slate-700 dark:text-amber-300 dark:hover:bg-amber-950/50"
                        >
                          <Archive className="h-3 w-3" />
                          Arsip
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paged.map((m) => (
            <article
              key={m.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <div className="flex items-start gap-3">
                  <MemberAvatar
                    churchId={churchId}
                    membership={membership}
                    fullName={m.fullName}
                    photoPath={m.photoPath}
                    sizeClass="h-11 w-11"
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onViewProfile(m)}
                      className="truncate text-left font-display text-sm font-semibold text-slate-900 hover:text-violet-700 hover:underline dark:text-slate-100 dark:hover:text-violet-400"
                    >
                      {m.fullName}
                    </button>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{m.memberCode}</span>
                      <span aria-hidden="true"> · </span>
                      <span className={`font-medium ${getStatusTextClass(m.status)}`}>
                        {getMemberStatusLabelID(m.status)}
                      </span>
                    </p>
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Telepon</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">{m.phone || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Keluarga</dt>
                    <dd className="truncate text-slate-800 dark:text-slate-200">
                      {m.familyGroupName || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Mulai Anggota</dt>
                    <dd className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {m.joinedDate || '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onViewProfile(m)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Detail
                </button>
                <button
                  type="button"
                  onClick={() => onEditMember(m)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmArchiveMember(m)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-slate-700 dark:text-amber-300 dark:hover:bg-amber-950/50"
                >
                  Arsipkan
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <span>
              Menampilkan{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)}
              </strong>{' '}
              dari{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {filtered.length}
              </strong>{' '}
              jemaat
            </span>
            <select
              aria-label="Jumlah baris per halaman"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value={10}>10 / hal</option>
              <option value={25}>25 / hal</option>
              <option value={50}>50 / hal</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Sebelumnya
            </button>
            <span className="px-2 font-mono text-slate-700 dark:text-slate-300 tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Berikutnya
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
