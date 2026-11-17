# Panduan Instalasi Multi-Perangkat & Native (PWA + Capacitor Android & iOS)

**Higayon Church Management** menggunakan arsitektur **Single Source of Truth**: aplikasi Web Desktop, Web Mobile/Tablet, PWA terpasang, Android native, dan iOS native terhubung ke **backend Firebase yang sama** (`praxis-implement-h01dl` / Firestore Enterprise `ai-studio-remixhigayonchur-6ad234a1-b5ec-466f-b61f-00dc3d1a78cd`). Tidak ada database SQLite/IndexedDB lokal yang memisahkan kebenaran data antar perangkat.

## 1. Progressive Web App (PWA) & Kebijakan Keamanan Offline

- Konfigurasi PWA di `vite.config.ts` (`vite-plugin-pwa`) menyediakan `manifest.webmanifest` serta caching **aset statis UI** (HTML, JS, CSS, font) demi performa antar perangkat.
- **Keamanan Data Offline**:
  - Cloud Firestore berjalan strictly in-memory tanpa persistensi IndexedDB lokal untuk mencegah kebocoran data jemaat dan keuangan di perangkat bersama.
  - Service Worker Workbox menerapkan strategi **`NetworkOnly`** untuk seluruh endpoint `firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `firebasestorage.googleapis.com`, `googleapis.com`, dan `accounts.google.com`.
  - Seluruh mutasi data diblokir ketika browser berada dalam kondisi offline (`assertBrowserOnline()`).

## 2. Konfigurasi Capacitor (`capacitor.config.ts`)

Identitas aplikasi native telah dikonfigurasi di root proyek:

- **App ID**: `org.higayon.churchmanagement`
- **App Name**: `Higayon Church Management`
- **Web Dir**: `dist`
- **Scheme**: `https` (Android & iOS)

## 3. Prasyarat Lingkungan Build Native

- Node.js 20+
- **Android**: Android Studio, Android SDK, dan JDK 17+
- **iOS**: macOS, Xcode 15+, dan CocoaPods (`sudo gem install cocoapods`)

## 4. Langkah Sinkronisasi & Kompilasi Native

1. Jalankan build aplikasi web produksi:
   ```bash
   npm run build
   ```
2. Pasang paket Capacitor pada mesin build lokal/CI:
   ```bash
   npm install @capacitor/core
   npm install -D @capacitor/cli
   npx cap add android
   npx cap add ios
   ```
3. Sinkronkan hasil `dist/` ke proyek native Android dan iOS:
   ```bash
   npx cap sync
   ```
4. Buka proyek pada IDE native untuk signing dan kompilasi biner (`.apk`/`.aab` atau `.ipa`):
   ```bash
   npx cap open android
   npx cap open ios
   ```

## 5. Signing Rilis, App Check & Kebersihan Keamanan Native

- **Android Release Signing**: Buat upload keystore privat di luar repository dan konfigurasi `signingConfigs` di `android/app/build.gradle` sebelum membangun `.aab` untuk Google Play / distribusi internal.
- **iOS Provisioning**: Atur Bundle Identifier `org.higayon.churchmanagement`, Apple Team Signing, dan Associated Domains di Xcode.
- **Firebase App Check (Wajib Produksi)**: Aktifkan **Play Integrity** (Android) dan **App Attest** (iOS) serta reCAPTCHA Enterprise (Web) di Firebase Console agar hanya klien resmi Higayon yang dapat mengakses backend.
- **Kerahasiaan Bundle**: Jangan pernah menanamkan private key, service account, atau secret administratif di dalam `dist/`, Android `assets/`, atau Xcode project.
