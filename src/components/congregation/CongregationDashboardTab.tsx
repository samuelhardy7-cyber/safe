import React from 'react';
import {
  Archive,
  FileSpreadsheet,
  FolderHeart,
  Plus,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import {computeCongregationStats} from '../../domain/congregation';
import type {
  CongregationActivity,
  CongregationMember,
  CongregationViewId,
  FamilyGroup,
} from '../../types/domain';
import {formatDateTimeID} from '../../utils/formatting';

interface CongregationDashboardTabProps {
  churchName: string;
  timezone: string;
  members: readonly CongregationMember[];
  families: readonly FamilyGroup[];
  activities: readonly CongregationActivity[];
  onNavigateView: (view: CongregationViewId) => void;
}

export const CongregationDashboardTab: React.FC<CongregationDashboardTabProps> = ({
  churchName,
  timezone,
  members,
  families,
  activities,
  onNavigateView,
}) => {
  const stats = computeCongregationStats(members, families);
  const maxGrowth = Math.max(1, ...stats.monthlyGrowth.map((g) => g.count));
  const maxFamilyCount = Math.max(1, ...stats.familyDistribution.map((f) => f.count));

  return (
    <div className="space-y-6">
      {/* KPI Summary Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Jemaat Terdaftar
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.totalNonArchived}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Non-arsip pada {churchName}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Jemaat Aktif</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {stats.active}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Nonaktif {stats.inactive} · Tamu {stats.visiting} · Pindah {stats.moved}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Kelompok Keluarga</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-[#0F1E36] dark:text-violet-300 tabular-nums">
            {stats.familyCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Relasi keluarga terstruktur
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Data Diarsipkan</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            {stats.archived}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Meninggal dunia: {stats.deceased}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Pintasan Manajemen Jemaat Rahasia
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Seluruh aksi tercatat pada riwayat aktivitas dan hanya dapat dijalankan oleh Church Owner.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigateView('create')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Anggota
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('directory')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Users className="h-3.5 w-3.5" />
              Direktori
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('families')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FolderHeart className="h-3.5 w-3.5" />
              Keluarga
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('import_export')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Impor / Ekspor
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('search')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Search className="h-3.5 w-3.5" />
              Cari Jemaat
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('archived')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Archive className="h-3.5 w-3.5" />
              Arsip ({stats.archived})
            </button>
          </div>
        </div>
      </section>

      {/* Visual Charts (SVG Monthly Growth + Family Group Distribution) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Pertumbuhan Keanggotaan per Bulan
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Berdasarkan tanggal mulai anggota (6 periode terakhir yang tercatat).
              </p>
            </div>
            <UserCheck className="h-4 w-4 text-violet-700 dark:text-violet-400" />
          </div>

          {stats.monthlyGrowth.length === 0 ? (
            <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">
              Belum ada data tanggal mulai anggota untuk menampilkan grafik pertumbuhan bulanan.
            </p>
          ) : (
            <div className="mt-6">
              <svg
                viewBox="0 0 420 150"
                className="h-40 w-full"
                role="img"
                aria-label="Grafik pertumbuhan keanggotaan per bulan"
              >
                {stats.monthlyGrowth.map((item, idx) => {
                  const colW = 420 / stats.monthlyGrowth.length;
                  const barW = Math.min(38, colW * 0.55);
                  const barH = Math.max(8, Math.round((item.count / maxGrowth) * 95));
                  const x = idx * colW + (colW - barW) / 2;
                  const y = 115 - barH;
                  return (
                    <g key={item.month}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx={4}
                        className="fill-[#0F1E36] dark:fill-violet-500"
                      />
                      <text
                        x={x + barW / 2}
                        y={y - 6}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        className="fill-[#0F1E36] dark:fill-slate-100"
                      >
                        {item.count}
                      </text>
                      <text
                        x={x + barW / 2}
                        y={136}
                        textAnchor="middle"
                        fontSize="10"
                        className="fill-slate-500 dark:fill-slate-400"
                      >
                        {item.month}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Distribusi Kelompok Keluarga
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Kelompok keluarga teratas berdasarkan jumlah anggota aktif &amp; terdaftar.
              </p>
            </div>
            <FolderHeart className="h-4 w-4 text-[#0F1E36] dark:text-violet-400" />
          </div>

          {stats.familyDistribution.length === 0 ? (
            <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">
              Belum ada data jemaat untuk menghitung distribusi keluarga.
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {stats.familyDistribution.map((fam) => {
                const widthPct = Math.max(6, Math.round((fam.count / maxFamilyCount) * 100));
                return (
                  <li key={fam.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {fam.name}
                      </span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                        {fam.count} jiwa
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-violet-700 dark:bg-violet-500"
                        style={{width: `${widthPct}%`}}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Recent Activity */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Riwayat Aktivitas Jemaat Terbaru
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Catatan append-only tanpa menampilkan data pribadi lengkap pada ringkasan log.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('activity')}
            className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
          >
            Lihat Semua Riwayat
          </button>
        </div>

        {activities.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Belum ada aktivitas tercatat pada modul jemaat gereja ini.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {activities.slice(0, 5).map((act) => (
              <li key={act.id} className="py-3">
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  {act.summary}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{act.action}</span>
                  {act.memberCode && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {act.memberCode}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">{formatDateTimeID(act.createdAt, timezone)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
