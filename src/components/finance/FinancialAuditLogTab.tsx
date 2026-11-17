import React, {useMemo, useState} from 'react';
import {Search, ShieldCheck} from 'lucide-react';
import type {FinanceAuditLog} from '../../types/domain';
import {formatDateTimeID, getRoleLabelID} from '../../utils/formatting';

interface FinancialAuditLogTabProps {
  timezone: string;
  auditLogs: readonly FinanceAuditLog[];
}

export const FinancialAuditLogTab: React.FC<FinancialAuditLogTabProps> = ({
  timezone,
  auditLogs,
}) => {
  const [searchText, setSearchText] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const distinctActions = useMemo(
    () => Array.from(new Set(auditLogs.map((l) => l.action))).sort(),
    [auditLogs],
  );

  const filteredLogs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (actionFilter && log.action !== actionFilter) return false;
      if (!q) return true;
      return (
        log.summary.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.txCode || '').toLowerCase().includes(q)
      );
    });
  }, [auditLogs, searchText, actionFilter]);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-teal-700 dark:text-teal-400" />
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Jejak Audit Keuangan (Append-Only)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Catatan penciptaan draf, persetujuan, penolakan, pembatalan void, akses bukti, dan
              ekspor laporan tidak dapat diubah atau dihapus.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Cari kode tx, pelaku, ringkasan..."
              className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <select
            aria-label="Filter jenis aksi audit"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">Semua Aksi ({auditLogs.length})</option>
            {distinctActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        {filteredLogs.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Tidak ada catatan audit keuangan yang cocok.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map((log) => (
              <li key={log.id} className="py-3.5 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{log.summary}</p>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    {formatDateTimeID(log.createdAt, timezone)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono text-violet-700 dark:text-violet-400">{log.action}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{log.actorEmail}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{getRoleLabelID(log.actorRole)}</span>
                  {log.txCode && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono">{log.txCode}</span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
