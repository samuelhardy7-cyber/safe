import React, {useEffect, useState} from 'react';
import {AlertCircle, Search, ShieldCheck} from 'lucide-react';
import {useChurch} from '../../contexts/ChurchContext';
import {fetchChurchAuditLogs} from '../../services/churchService';
import type {AuditLogEntry} from '../../types/domain';
import {formatDateTimeID, getRoleLabelID} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

export const AuditLogView: React.FC = () => {
  const {activeChurch, activeMembership} = useChurch();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchChurchAuditLogs(activeChurch.id, activeMembership)
      .then((items) => {
        if (!cancelled) setLogs(items);
      })
      .catch((err) => {
        if (!cancelled) setError(extractUserErrorMessage(err, 'Gagal memuat audit log gereja.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChurch, activeMembership]);

  if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-slate-900 dark:text-rose-300">
        Hanya Church Owner yang dapat melihat audit log lengkap gereja.
      </div>
    );
  }

  const filtered = logs.filter((log) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      log.summary.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.actorEmail.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-[#0F1E36] dark:text-violet-400" />
            <div>
              <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Audit Log Gereja ({activeChurch.name})
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Seluruh catatan keamanan bersifat immutable (tidak dapat diubah atau dihapus).
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari aksi atau email..."
              aria-label="Cari catatan audit"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-violet-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="mt-5 h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : filtered.length === 0 ? (
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            Tidak ada entri audit yang sesuai dengan kriteria pencarian.
          </p>
        ) : (
          <>
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Waktu ({activeChurch.timezone})</th>
                    <th className="py-2.5 pr-4 font-medium">Aktor</th>
                    <th className="py-2.5 pr-4 font-medium">Aksi</th>
                    <th className="py-2.5 font-medium">Ringkasan Aktivitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-400">
                        {formatDateTimeID(log.createdAt, activeChurch.timezone)}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {log.actorEmail}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {getRoleLabelID(log.actorRole)}
                        </p>
                      </td>
                      <td className="py-3 pr-4 font-mono text-[11px] text-violet-800 dark:text-violet-400">
                        {log.action}
                      </td>
                      <td className="py-3 text-slate-700 dark:text-slate-300">{log.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 space-y-3 md:hidden">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-slate-200 p-3.5 text-xs dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium text-violet-800 dark:text-violet-400">
                      {log.action}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {formatDateTimeID(log.createdAt, activeChurch.timezone)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-slate-800 dark:text-slate-200">{log.summary}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {log.actorEmail} · {getRoleLabelID(log.actorRole)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
