export type InstallPlatformId = 'android' | 'ios' | 'windows' | 'macos' | 'linux';

export interface PlatformInstallGuide {
  id: InstallPlatformId;
  label: string;
  shortLabel: string;
  browserHint: string;
  steps: string[];
  note: string;
}

export function detectInstallPlatform(
  userAgent: string,
  maxTouchPoints = 0,
): InstallPlatformId {
  const ua = (userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) {
    return 'ios';
  }
  if (/macintosh/.test(ua) && maxTouchPoints > 1) {
    return 'ios';
  }
  if (/android/.test(ua)) {
    return 'android';
  }
  if (/windows|win32|win64/.test(ua)) {
    return 'windows';
  }
  if (/macintosh|mac os x/.test(ua)) {
    return 'macos';
  }
  return 'linux';
}

export const INSTALL_PLATFORM_GUIDES: readonly PlatformInstallGuide[] = [
  {
    id: 'android',
    label: 'Android (Chrome / Edge)',
    shortLabel: 'Android',
    browserHint: 'Google Chrome atau Microsoft Edge untuk Android',
    steps: [
      'Buka Higayon Church Management di browser Chrome atau Edge.',
      'Ketuk tombol "Pasang Langsung" di atas jika muncul, atau buka menu titik tiga (⋮) di kanan atas browser.',
      'Pilih "Tambahkan ke layar utama" (Add to Home screen) lalu pilih "Instal".',
      'Buka ikon Higayon dari layar beranda untuk menjalankan aplikasi dalam mode layar penuh mandiri.',
    ],
    note: 'Data tetap terhubung langsung ke Cloud Firestore dan tidak menyimpan database lokal yang terpisah.',
  },
  {
    id: 'ios',
    label: 'iPhone & iPad (Safari)',
    shortLabel: 'iOS / iPadOS',
    browserHint: 'Wajib menggunakan Apple Safari di iPhone atau iPad',
    steps: [
      'Pastikan Anda membuka halaman ini menggunakan browser Safari (bukan browser dalam aplikasi lain).',
      'Ketuk tombol Bagikan (Share / ikon kotak dengan panah ke atas) pada bilah navigasi Safari.',
      'Gulir ke bawah dan pilih "Tambah ke Layar Utama" (Add to Home Screen).',
      'Ketuk "Tambah" (Add) di kanan atas. Buka Higayon langsung dari ikon layar utama.',
    ],
    note: 'iOS Safari tidak menampilkan dialog instalasi otomatis; pemasangan dilakukan melalui menu Bagikan.',
  },
  {
    id: 'windows',
    label: 'Windows (Chrome / Edge)',
    shortLabel: 'Windows',
    browserHint: 'Google Chrome atau Microsoft Edge Desktop',
    steps: [
      'Buka Higayon menggunakan Google Chrome atau Microsoft Edge di Windows 10/11.',
      'Klik tombol "Pasang Langsung" jika tersedia, atau klik ikon instalasi di sisi kanan address bar.',
      'Alternatif Edge/Chrome: buka menu (⋯ / ⋮) > "Apps" > "Install this site as an app".',
      'Aplikasi akan muncul di Start Menu, Desktop, dan Taskbar Windows sebagai jendela aplikasi terpisah.',
    ],
    note: 'Sesi autentikasi tetap diamankan Firebase Auth tanpa menyimpan data sensitif jemaat di cache offline.',
  },
  {
    id: 'macos',
    label: 'macOS (Chrome / Edge / Safari)',
    shortLabel: 'macOS',
    browserHint: 'Google Chrome, Microsoft Edge, atau Safari macOS Sonoma+',
    steps: [
      'Di Chrome atau Edge: klik ikon pasang di address bar atau pilih menu > "Save and Share" > "Install page as app".',
      'Di Safari macOS Sonoma/Sequoia: pilih menu "File" > "Add to Dock..." lalu klik "Add".',
      'Buka Higayon langsung dari Dock, Launchpad, atau folder Applications.',
    ],
    note: 'Seluruh perubahan data di Mac langsung tersinkronisasi ke backend gereja yang sama.',
  },
  {
    id: 'linux',
    label: 'Linux (Chrome / Chromium / Edge)',
    shortLabel: 'Linux',
    browserHint: 'Google Chrome, Chromium, atau Microsoft Edge di Linux Desktop',
    steps: [
      'Buka Higayon menggunakan Google Chrome, Chromium, atau Microsoft Edge.',
      'Klik tombol "Pasang Langsung" jika tersedia, atau klik ikon instalasi di address bar kanan.',
      'Alternatif menu: buka menu (⋮) > "Save and Share" / "Apps" > "Install Higayon".',
      'Shortcut aplikasi akan terdaftar di App Launcher desktop (GNOME / KDE / XFCE).',
    ],
    note: 'PWA berjalan di atas koneksi HTTPS dan menjaga isolasi tenant gereja secara ketat.',
  },
];

export function getInstallGuideByPlatform(platform: InstallPlatformId): PlatformInstallGuide {
  return (
    INSTALL_PLATFORM_GUIDES.find((g) => g.id === platform) || INSTALL_PLATFORM_GUIDES[0]
  );
}
