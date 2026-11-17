import React, {useMemo, useState} from 'react';
import {History, Search} from 'lucide-react';
import type {CongregationActivity} from '../../types/domain';
import {formatDateTimeID} from '../../utils/formatting';

interface CongregationActivityTabProps {
  timezone: string;
  activities: readonly CongregationActivity[];
}

export const CongregationActivityTab: React.FC<CongregationActivityTabProps> = ({
  timezone,
  activities,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((a) =>
      [a.action, a.summary, a.memberCode || '', a.actorEmail].join(' ').toLowerCase().includes(q),
    );
  }, [activities, search]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-violet-700 dark:text-violet-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Riwayat Aktivitas Jemaat (Append-Only)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Catatan aktivitas hanya dapat dibaca oleh Church Owner dan tidak mencantumkan data sensitif lengkap.
              </p>
            </div>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter kode JMT, aksi, ringkasan..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0F1E36] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:bg-slate-950"
            />
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Belum ada aktivitas jemaat yang tercatat.
        </section>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((act) => (
              <article
                key={act.id}
                className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-medium text-violet-700 dark:text-violet-400">
                    {act.action}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatDateTimeID(act.createdAt, timezone)}
                  </span>
                </div>
                <p className="mt-1.5 font-medium text-slate-900 dark:text-slate-100">
                  {act.summary}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{act.memberCode || '—'}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{act.actorEmail}</span>
                </p>
              </article>
            ))}
          </div>

          <section className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Waktu (WIB/Lokal)</th>
                    <th className="px-4 py-3">Aksi</th>
                    <th className="px-4 py-3">Kode Jemaat</th>
                    <th className="px-4 py-3">Ringkasan</th>
                    <th className="px-4 py-3">Pelaku</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((act) => (
                    <tr key={act.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                        {formatDateTimeID(act.createdAt, timezone)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-violet-700 dark:text-violet-400">
                        {act.action}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                        {act.memberCode || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                        {act.summary}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
                        {act.actorEmail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
