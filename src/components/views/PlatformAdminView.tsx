import React, {useEffect, useState} from 'react';
import {Shield, ShieldAlert} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {verifyFirestoreConnection, type FirebaseStatusInfo} from '../../firebase';

export const PlatformAdminView: React.FC = () => {
  const {isPlatformAdmin} = useAuth();
  const [status, setStatus] = useState<FirebaseStatusInfo | null>(null);

  useEffect(() => {
    void verifyFirestoreConnection().then(setStatus);
  }, []);

  if (!isPlatformAdmin) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-slate-900 dark:text-rose-300">
        Akses ditolak: konsol ini khusus untuk Platform Administrator terdaftar.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EBF2FC] text-[#0F1E36] dark:bg-violet-950/60 dark:text-violet-300">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Konsol Operasional Platform
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Memantau kesehatan teknis infrastruktur tanpa akses aplikasi ke data jemaat atau
              transaksi keuangan gereja mana pun.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="font-semibold">Batasan Pemisahan Wewenang (Least Privilege)</p>
              <p className="mt-1">
                Peran Platform Administrator diblokir oleh Firestore Security Rules untuk membaca
                koleksi <code className="font-mono">congregationMembers</code>,{' '}
                <code className="font-mono">financeAccounts</code>, maupun{' '}
                <code className="font-mono">financeTransactions</code>. Pemeliharaan infrastruktur
                tingkat proyek Cloud harus selalu diaudit sesuai prinsip least privilege.
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 text-xs dark:divide-slate-800 dark:border-slate-800">
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-slate-500 dark:text-slate-400">Firebase Project ID</dt>
            <dd className="font-mono text-slate-900 dark:text-slate-100">
              {status?.projectId || '...'}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-slate-500 dark:text-slate-400">Cloud Firestore Database ID</dt>
            <dd className="font-mono text-slate-900 dark:text-slate-100">
              {status?.databaseId || '...'}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-slate-500 dark:text-slate-400">Konektivitas Cloud Firestore</dt>
            <dd className="font-medium text-emerald-700 dark:text-emerald-400">
              {status?.connectionState === 'connected'
                ? 'Terhubung'
                : status?.connectionState || 'Memeriksa'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
};
