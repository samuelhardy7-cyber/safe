# Panduan Konfigurasi Firebase — Higayon Church Management

Dokumen ini menjelaskan konfigurasi dan operasional Firebase untuk menjalankan **Higayon Church Management** secara penuh di atas Cloud Firestore Enterprise Edition, Firebase Authentication, Firebase Storage, dan Cloud Functions v2.

## 1. Spesifikasi Proyek & Koneksi Aktif

Konfigurasi klien web dibaca dari `firebase-applet-config.json` (tanpa secret server atau Service Account JSON):

- **Project ID**: `praxis-implement-h01dl`
- **Firestore Database ID (Enterprise Edition)**: `ai-studio-remixhigayonchur-6ad234a1-b5ec-466f-b61f-00dc3d1a78cd`
- **Auth Domain**: `praxis-implement-h01dl.firebaseapp.com`
- **Storage Bucket**: `praxis-implement-h01dl.firebasestorage.app`

> **Keamanan Kredensial**: Jangan pernah menyimpan Service Account JSON, Private Key, atau `client_secret` OAuth di repository frontend maupun variabel `VITE_*`.

## 2. Mengaktifkan Provider Autentikasi & MFA (WAJIB)

Pastikan pengaturan di **Firebase Console** (`Build > Authentication`) aktif sebelum penggunaan produksi:

1. Buka **Sign-in method** pada project `praxis-implement-h01dl`.
2. Aktifkan provider berikut:
   - **Email/Password** (aktifkan metode standar Email/Password; tetap nonaktifkan Anonymous Auth).
   - **Google** (isi *Project support email* dan pastikan OAuth consent screen sudah siap).
3. Masuk ke **Authentication > Settings > Authorized domains** dan daftarkan seluruh domain preview serta domain produksi aplikasi Anda.
4. Aktifkan verifikasi email pada alur pendaftaran (sudah diwajibkan juga di `firestore.rules` melalui `request.auth.token.email_verified == true` dan `EmailVerificationGate`).
5. **Multi-Factor Authentication (MFA)**: Untuk Church Owner dan Finance Approver, aktifkan MFA (SMS atau Authenticator App / TOTP) di menu **Authentication > Settings > Multi-factor authentication** demi perlindungan akun tingkat lanjut.

## 3. Cloud Firestore & Validasi Security Rules

Aplikasi ini menggunakan database Firestore non-default (`ai-studio-remixhigayonchur-6ad234a1-b5ec-466f-b61f-00dc3d1a78cd`) dengan isolasi tenant ketat di bawah `churches/{churchId}`:

- Semua jalur ditolak secara default (`allow read, write: if false;`).
- **Data Jemaat** (`congregationMembers`, `familyGroups`, `congregationActivities`) hanya boleh dibaca dan ditulis oleh **Church Owner aktif** gereja tersebut.
- **Data Keuangan** (`financeAccounts`, `financeCategories`, `financeTransactions`, `financeSettings`, `financeAuditLogs`) hanya boleh diakses oleh **Owner** atau anggota berizin eksplisit (`financePermissions` terikat `churchId`).
- **Platform Admin** tidak memiliki izin baca/tulis isi data jemaat maupun transaksi keuangan gereja.

Sebelum melakukan deployment rules, jalankan pemeriksaan ESLint security rules terlebih dahulu:

```bash
npx eslint firestore.rules
firebase deploy --only firestore:rules --project praxis-implement-h01dl
```

## 4. Firebase Storage (Akses Privat & Arsip Backup)

Bucket privat `praxis-implement-h01dl.firebasestorage.app` diamankan oleh `storage.rules`:

- Lampiran/foto jemaat (`churches/{churchId}/congregation/...`) hanya dapat diakses oleh **Church Owner aktif**.
- Bukti transaksi keuangan (`churches/{churchId}/finance/receipts/...`) hanya dapat diakses oleh Owner atau pengguna yang memiliki izin keuangan (`finance.viewReceipts` / akses keuangan terverifikasi).
- Arsip backup JSON terverifikasi SHA-256 (`churches/{churchId}/backups/...`) hanya dapat diakses oleh **Church Owner aktif**.

Deploy aturan Storage:

```bash
firebase deploy --only storage --project praxis-implement-h01dl
```

## 5. Cloud Functions v2 (Server-Side & Jadwal Harian)

Fungsi server tepercaya berada di `functions/src/index.ts` dan dikonfigurasi ke Database ID `ai-studio-remixhigayonchur-6ad234a1-b5ec-466f-b61f-00dc3d1a78cd`:

- `revokeChurchMembership` *(Callable)*: Mencabut keanggotaan pengguna secara atomik beserta audit trail.
- `completeChurchOwnershipTransfer` *(Callable)*: Memindahkan kepemilikan gereja (`ownerId`) dan menyinkronkan subkoleksi tenant setelah penerima menyetujui permintaan transfer.
- `logCongregationSensitiveAction` *(Callable)*: Pencatatan audit server-side untuk operasi sensitif modul jemaat tanpa membocorkan PII anggota.
- `scheduledDailyChurchBackups` *(Scheduler — `every day 02:00`, `Asia/Jakarta`)*: Membuat arsip JSON lengkap + checksum SHA-256 ke Firebase Storage untuk gereja yang mengaktifkan `automatedBackupEnabled`.
- Trigger Firestore otomatis: `onCongregationMemberWritten`, `onMembershipRoleUpdated`, `onInvitationCreated`, `onMembershipFinanceSync`, dan `onFinanceTransactionWritten`.

> **Prasyarat Plan**: Deployment Cloud Functions v2 & Cloud Scheduler memerlukan paket **Firebase Blaze (Pay-as-you-go)**.

Langkah deploy Cloud Functions:

```bash
cd functions
npm install
npm run build
firebase deploy --only functions --project praxis-implement-h01dl
```

## 6. Cadangan Opsional Google Drive Owner (`VITE_GOOGLE_DRIVE_CLIENT_ID`)

Fitur unggah salinan arsip JSON ke Google Drive pribadi milik **Church Owner** bersifat **opsional** dan menggunakan **Google Identity Services (OAuth 2.0 client-side token)** dengan scope minimal `https://www.googleapis.com/auth/drive.file`:

1. Buat OAuth 2.0 Client ID tipe **Web application** di Google Cloud Console untuk project `praxis-implement-h01dl`.
2. Daftarkan origin aplikasi Anda pada *Authorized JavaScript origins*.
3. Isi variabel lingkungan `VITE_GOOGLE_DRIVE_CLIENT_ID` saat build (jangan pernah menambahkan `client_secret` pada frontend).
4. Jika `VITE_GOOGLE_DRIVE_CLIENT_ID` kosong, UI secara jujur menampilkan status **"Belum Terhubung (Memerlukan Konfigurasi OAuth)"** dan tidak memalsukan status terhubung.
