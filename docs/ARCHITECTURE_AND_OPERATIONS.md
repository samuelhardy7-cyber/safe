# Arsitektur Sistem, Keamanan & Operasional — Higayon Church Management

Dokumen ini merangkum arsitektur teknis, isolasi data multi-gereja, kontrol akses berbasis kepemilikan & izin granular, sinkronisasi real-time, kebijakan keamanan offline, serta prosedur backup dan pemulihan pada **Higayon Church Management**.

## 1. Isolasi Tenant Multi-Gereja (Multi-Church Isolation)

Seluruh data operasional gereja disimpan di dalam batas tenant masing-masing di bawah `churches/{churchId}` pada Cloud Firestore Enterprise Edition (`ai-studio-remixhigayonchur-6ad234a1-b5ec-466f-b61f-00dc3d1a78cd`):

- **Root & Keanggotaan**:
  - `churches/{churchId}` menyimpan profil gereja, `ownerId`, dan status gereja.
  - `churches/{churchId}/memberships/{uid}` menjadi sumber otoritas peran (`owner`, `finance_manager`, `finance_staff`, `church_staff`), status (`active`, `revoked`), `financePermissions`, dan `staffPermissions`.
  - `userChurchRefs/{uid}/churches/{churchId}` menyimpan indeks gereja milik pengguna agar perpindahan gereja aktif berjalan cepat dan terisolasi.
- **Zero Cross-Tenant Leakage**: Firestore Security Rules dan Storage Rules memvalidasi `churchId` dan keanggotaan aktif pada setiap pembacaan maupun penulisan dokumen tunggal maupun query daftar (`allow list`).

## 2. Privasi Data Jemaat (Ketat Khusus Owner)

Seluruh data jemaat (`congregationMembers`, `familyGroups`, `congregationActivities`) serta berkas lampiran di Firebase Storage (`churches/{churchId}/congregation/...`) hanya dapat diakses oleh **Church Owner aktif** dari gereja tersebut:

- Finance Manager, Finance Staff, Church Staff, dan Platform Admin **tidak memiliki akses** melihat, mencari, mengekspor, ataupun memodifikasi data jemaat — baik melalui UI maupun permintaan langsung ke Firestore/Storage/Functions.
- Audit modul jemaat menerapkan **minimasi data (PII isolation)**: ringkasan log mencatat kode anggota dan tindakan tanpa membocorkan alamat, telepon, atau catatan pastoral sensitif.

## 3. Kontrol Akses Keuangan Granular & Workflow Maker-Checker

Akses keuangan tidak cukup ditentukan oleh role semata, melainkan melalui **13 izin granular** yang diberikan Owner secara eksplisit per `churchId`:

- `finance.view`, `finance.create`, `finance.editDraft`, `finance.submit`, `finance.approve`, `finance.reject`, `finance.void`, `finance.export`, `finance.viewReports`, `finance.viewReceipts`, `finance.manageAccounts`, `finance.manageCategories`, `finance.manageSettings`.
- Transaksi mendukung alur **Maker–Checker**: `draft` -> `submitted` -> `approved` / `locked` / `rejected`, serta pembatalan resmi (`voided`) oleh pemegang izin tanpa menghapus rekam jejak akuntansi.
- `onMembershipFinanceSync` pada Cloud Functions menyinkronkan `authorizedViewerUids` pada dokumen keuangan setiap kali keanggotaan atau izin keuangan diubah Owner.

## 4. Sinkronisasi Real-Time & Optimistic Concurrency

- **Live Header Indicator**: `ChurchContext` memantau listener `onSnapshot` dan status jaringan untuk menampilkan status sinkronisasi real-time pada header (`Tersinkronisasi`, `Menyinkronkan`, `Offline`, `Error`), tanpa menggunakan indikator telemetri palsu.
- **Optimistic Concurrency Control (`version`)**: Pembaruan data anggota jemaat, kelompok keluarga, akun kas, dan transaksi keuangan menggunakan transaksi Firestore/pengecekan `version` agar dua sesi bersamaan tidak saling menimpa perubahan secara diam-diam.

## 5. Kebijakan Keamanan Offline & Kontrol Sesi

- **No Persistent Local DB Cache**: Cloud Firestore diinisialisasi *strictly in-memory* (tanpa IndexedDB offline persistence) agar PII jemaat dan saldo gereja tidak tertinggal di cache browser atau perangkat bersama.
- **Service Worker Strict NetworkOnly**: Aset UI statis dapat dimuat oleh PWA, tetapi seluruh request ke Firestore, Auth, Storage, dan Google APIs melewati `NetworkOnly`.
- **Offline Mutation Guard**: Fungsi `assertBrowserOnline()` memblokir operasi tulis (simpan, ubah, hapus, restore, transfer kepemilikan) saat koneksi terputus.
- **Session Timeout & PIN Lock**: Mendukung batas waktu sesi diam (`sessionTimeoutMinutes` di `settings/general`), layar kunci PIN lokal opsional, serta *re-authentication modal* sebelum aksi sensitif.

## 6. Backup Terverifikasi SHA-256 & Restore 4 Langkah

Modul **Backup & Pemulihan** (`src/domain/backup.ts`, `BackupRecoveryView.tsx`, dan `scheduledDailyChurchBackups`):

1. **Snapshot Lengkap / Parsial**: Mencakup profil gereja, pengaturan, keanggotaan, jemaat, keluarga, aktivitas, akun, kategori, transaksi, audit log, dan manifest lampiran.
2. **Integritas SHA-256**: Setiap arsip menghitung hash SHA-256 kanonis sebelum diunggah ke Storage privat (`churches/{churchId}/backups/{backupId}.json`) atau diunduh lokal.
3. **Jadwal Otomatis Harian**: Cloud Function `scheduledDailyChurchBackups` berjalan setiap pukul **02:00 WIB (`Asia/Jakarta`)** bagi gereja dengan `automatedBackupEnabled: true`.
4. **Wizard Restore 4 Langkah**:
   - **Langkah 1**: Unggah/pilih arsip JSON atau dari Cloud Storage.
   - **Langkah 2**: Verifikasi format `higayon-church-backup-v1`, kecocokan `churchId`, dan validasi checksum SHA-256.
   - **Langkah 3**: Pratinjau jumlah catatan & pembuatan **Pre-Restore Safety Backup (`pre_restore`)** otomatis sebelum penimpaan.
   - **Langkah 4**: Eksekusi pemulihan batch + pencatatan audit log resmi.

## 7. Pemulihan Akun & Pemindahan Kepemilikan Gereja

- Pemulihan akun memanfaatkan verifikasi email, reset kata sandi Firebase Auth, manajemen sesi, dan dukungan MFA di level autentikasi.
- **Ownership Transfer**: Owner dapat menginisiasi permintaan pemindahan kepemilikan di koleksi `churches/{churchId}/ownershipTransfers/{transferId}` kepada pengguna aktif gereja. Setelah penerima menyetujui (`accepted`), Cloud Function `completeChurchOwnershipTransfer` memindahkan `ownerId` gereja, memperbarui role anggota lama menjadi `church_staff`, menaikkan penerima menjadi `owner`, dan menyelaraskan `ownerUid` di seluruh subkoleksi tenant secara atomik.
