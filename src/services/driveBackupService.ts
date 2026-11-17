export interface DriveBackupConfigStatus {
  configured: boolean;
  clientIdPresent: boolean;
  statusLabel: string;
  detailMessage: string;
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  uploadedAtIso: string;
}

/**
 * Evaluates whether optional Google Drive OAuth backup client configuration is present.
 * Never fabricates a connected status when VITE_GOOGLE_DRIVE_CLIENT_ID is unconfigured.
 */
export function getDriveBackupConfigStatus(): DriveBackupConfigStatus {
  const clientId = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '').trim();
  if (!clientId) {
    return {
      configured: false,
      clientIdPresent: false,
      statusLabel: 'Belum Terhubung (Memerlukan Konfigurasi OAuth)',
      detailMessage:
        'Cadangan tambahan ke Google Drive Owner belum aktif karena Client ID OAuth (VITE_GOOGLE_DRIVE_CLIENT_ID) belum dikonfigurasi pada environment aplikasi.',
    };
  }

  return {
    configured: true,
    clientIdPresent: true,
    statusLabel: 'Siap Dihubungkan via OAuth Google Drive',
    detailMessage:
      'Client ID OAuth terdeteksi. Anda dapat mengunggah salinan arsip JSON terverifikasi SHA-256 langsung ke Google Drive pribadi Owner.',
  };
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: {access_token?: string; error?: string}) => void;
          }) => {requestAccessToken: () => void};
        };
      };
    };
  }
}

async function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') throw new Error('Browser tidak tersedia.');
  if (window.google?.accounts?.oauth2) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-higayon-gis="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), {once: true});
      existing.addEventListener('error', () => reject(new Error('Gagal memuat Google Identity Services.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.higayonGis = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat skrip OAuth Google Drive.'));
    document.head.appendChild(script);
  });
}

export async function uploadArchiveToGoogleDrive(
  fileName: string,
  serializedJson: string,
): Promise<DriveUploadResult> {
  const clientId = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '').trim();
  if (!clientId) {
    throw new Error(
      'Integrasi Google Drive belum dikonfigurasi (VITE_GOOGLE_DRIVE_CLIENT_ID kosong). Gunakan unduhan arsip terenkripsi atau cadangan Cloud Storage privat.',
    );
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Modul OAuth Google Identity Services tidak tersedia di browser.');
  }

  const accessToken = await new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Otorisasi OAuth Google Drive dibatalkan atau ditolak.'));
          return;
        }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });

  const boundary = `higayon_bkp_${Date.now()}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: 'application/json',
    description: 'Higayon Church Management — Arsip Backup Terverifikasi SHA-256',
  });

  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    serializedJson,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Unggah ke Google Drive gagal (${res.status}): ${errText.slice(0, 160)}`);
  }

  const data = (await res.json()) as {id: string; name: string};
  return {
    fileId: data.id,
    name: data.name || fileName,
    uploadedAtIso: new Date().toISOString(),
  };
}
