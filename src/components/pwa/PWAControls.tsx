import React, {useEffect, useRef, useState} from 'react';
import {
  CheckCircle2,
  Download,
  Laptop,
  Monitor,
  RefreshCw,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import {registerSW} from 'virtual:pwa-register';
import {
  getInstallGuideByPlatform,
  INSTALL_PLATFORM_GUIDES,
  type InstallPlatformId,
} from '../../domain/pwa';
import {usePWAInstall} from '../../hooks/usePWAInstall';
import {useOnlineStatus} from '../../hooks/useOnlineStatus';

interface InstallHigayonModalProps {
  open: boolean;
  onClose: () => void;
}

export const InstallHigayonModal: React.FC<InstallHigayonModalProps> = ({open, onClose}) => {
  const {isInstallable, isInstalled, platform, install} = usePWAInstall();
  const [selectedTab, setSelectedTab] = useState<InstallPlatformId>(platform);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setSelectedTab(platform);
  }, [platform]);

  if (!open) return null;

  const activeGuide = getInstallGuideByPlatform(selectedTab);

  const handleDirectInstall = async () => {
    if (!isInstallable || installing) return;
    setInstalling(true);
    try {
      const accepted = await install();
      if (accepted) {
        onClose();
      }
    } finally {
      setInstalling(false);
    }
  };

  const getTabIcon = (id: InstallPlatformId) => {
    if (id === 'android' || id === 'ios') return Smartphone;
    if (id === 'macos') return Laptop;
    return Monitor;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-higayon-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
              Instalasi Multi-Perangkat (PWA)
            </p>
            <h2
              id="install-higayon-title"
              className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Install Higayon Church Management
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Pasang aplikasi di perangkat Anda agar dapat dibuka dari Layar Utama / Start Menu /
              Dock dengan tetap tersambung ke satu backend Cloud Firestore yang sama.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panduan instalasi Higayon"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live Browser Capability Status */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          {isInstalled ? (
            <div className="flex items-center gap-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Higayon sudah terpasang dan berjalan dalam mode aplikasi mandiri (Standalone PWA).
              </span>
            </div>
          ) : isInstallable ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Perangkat &amp; browser ini mendukung instalasi langsung
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                  Klik tombol di samping untuk memasang shortcut aplikasi resmi tanpa toko aplikasi.
                </p>
              </div>
              <button
                type="button"
                disabled={installing}
                onClick={() => void handleDirectInstall()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                <Download className="h-3.5 w-3.5" />
                {installing ? 'Memasang...' : 'Pasang Langsung Sekarang'}
              </button>
            </div>
          ) : (
            <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Instalasi melalui menu browser perangkat ({activeGuide.shortLabel})
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Browser saat ini tidak memicu prompt otomatis (misalnya Safari iOS, mode pratinjau
                iframe, atau sudah pernah ditutup). Ikuti langkah resmi untuk sistem operasi Anda di
                bawah ini.
              </p>
            </div>
          )}
        </div>

        {/* Platform Switcher Tabs */}
        <div
          role="tablist"
          aria-label="Pilih Sistem Operasi Perangkat"
          className="mt-5 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 dark:border-slate-800"
        >
          {INSTALL_PLATFORM_GUIDES.map((guide) => {
            const Icon = getTabIcon(guide.id);
            const active = selectedTab === guide.id;
            const isDetected = platform === guide.id;
            return (
              <button
                key={guide.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedTab(guide.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0F1E36] text-white dark:bg-violet-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{guide.shortLabel}</span>
                {isDetected && (
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] font-semibold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200'
                    }`}
                  >
                    Perangkat Ini
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Platform Steps */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeGuide.label}
            </h3>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {activeGuide.browserHint}
            </span>
          </div>

          <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {activeGuide.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[11px] font-semibold text-[#0F1E36] dark:bg-slate-800 dark:text-violet-300">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <strong>Keamanan &amp; Sinkronisasi:</strong> {activeGuide.note}
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            Tutup Panduan
          </button>
        </div>
      </div>
    </div>
  );
};

interface PWAInstallButtonProps {
  label?: string;
  alwaysShowGuide?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  label = 'Install Higayon',
  alwaysShowGuide = true,
}) => {
  const {isInstallable, isInstalled, install} = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled && !alwaysShowGuide) {
    return null;
  }

  if (isInstalled && alwaysShowGuide) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <Download className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400" />
        <span>{label}</span>
      </button>

      <InstallHigayonModal open={showGuideModal} onClose={() => setShowGuideModal(false)} />
    </>
  );
};

export const PWAUpdatePrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updating, setUpdating] = useState(false);
  const updateFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
    updateFnRef.current = updateSW;
  }, []);

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-violet-300 bg-white p-4 shadow-xl dark:border-violet-800 dark:bg-slate-900"
    >
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-400" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
            Pembaruan Aplikasi Higayon Tersedia
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            Simpan terlebih dahulu form atau draf transaksi yang sedang Anda kerjakan sebelum memuat
            ulang ke versi terbaru.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={updating}
              onClick={() => {
                setUpdating(true);
                void updateFnRef.current?.(true);
              }}
              className="rounded-lg bg-[#0F1E36] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              {updating ? 'Memuat Ulang...' : 'Muat Ulang Aman'}
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Nanti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-200"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
      <span>Mode Offline — Koneksi ke Cloud Firestore terputus sementara.</span>
    </div>
  );
};
