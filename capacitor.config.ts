/**
 * Higayon Church Management — Capacitor Native Wrapper Configuration
 *
 * Seluruh platform (Web PWA, Android, iOS) menggunakan backend Firebase yang sama
 * (Firebase Authentication, Cloud Firestore, Firebase Storage, Cloud Functions).
 * Jangan pernah membuat database lokal terpisah di perangkat.
 */
const config = {
  appId: 'org.higayon.churchmanagement',
  appName: 'Higayon Church Management',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0F1E36',
      showSpinner: false,
    },
  },
};

export default config;
