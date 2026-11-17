import React, {useEffect, useState} from 'react';
import {
  Archive,
  ArrowLeft,
  Download,
  Edit3,
  Eye,
  FileText,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  downloadPrivateStorageBlob,
  removeMemberAttachment,
  uploadMemberAttachment,
  uploadMemberPhoto,
} from '../../services/congregationService';
import type {
  ChurchMembership,
  CongregationActivity,
  CongregationAttachment,
  CongregationMember,
} from '../../types/domain';
import {
  formatDateTimeID,
  getFamilyRoleLabelID,
  getMemberStatusLabelID,
} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {triggerEphemeralBlobDownload} from '../../utils/congregationExport';
import {MemberAvatar} from './MemberAvatar';

interface MemberProfileViewProps {
  churchId: string;
  timezone: string;
  membership: ChurchMembership;
  member: CongregationMember;
  activities: readonly CongregationActivity[];
  onBack: () => void;
  onEdit: (member: CongregationMember) => void;
  onArchiveToggle: (member: CongregationMember, archive: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export const MemberProfileView: React.FC<MemberProfileViewProps> = ({
  churchId,
  timezone,
  membership,
  member,
  activities,
  onBack,
  onEdit,
  onArchiveToggle,
  onRefresh,
}) => {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    name: string;
    contentType: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewState?.url) {
        URL.revokeObjectURL(previewState.url);
      }
    };
  }, [previewState]);

  const memberActivities = activities.filter(
    (a) => a.memberId === member.id || a.memberCode === member.memberCode,
  );

  const handlePhotoUpload = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setStatusError(null);
    try {
      await uploadMemberPhoto(churchId, membership, member, file);
      await onRefresh();
    } catch (err) {
      setStatusError(extractUserErrorMessage(err, 'Gagal mengunggah foto.'));
    } finally {
      setBusy(false);
    }
  };

  const handleAttachmentUpload = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setStatusError(null);
    try {
      await uploadMemberAttachment(churchId, membership, member, file);
      await onRefresh();
    } catch (err) {
      setStatusError(extractUserErrorMessage(err, 'Gagal mengunggah lampiran.'));
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewAttachment = async (att: CongregationAttachment) => {
    setBusy(true);
    setStatusError(null);
    try {
      const blob = await downloadPrivateStorageBlob(
        churchId,
        membership,
        att.storagePath,
        att.contentType,
      );
      if (previewState?.url) URL.revokeObjectURL(previewState.url);
      const url = URL.createObjectURL(blob);
      setPreviewState({name: att.name, contentType: att.contentType, url});
    } catch (err) {
      setStatusError(
        extractUserErrorMessage(err, 'Gagal memuat pratinjau dokumen privat.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadAttachment = async (att: CongregationAttachment) => {
    setBusy(true);
    setStatusError(null);
    try {
      const blob = await downloadPrivateStorageBlob(
        churchId,
        membership,
        att.storagePath,
        att.contentType,
      );
      triggerEphemeralBlobDownload(blob, att.name);
    } catch (err) {
      setStatusError(extractUserErrorMessage(err, 'Gagal mengunduh dokumen privat.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAttachment = async (att: CongregationAttachment) => {
    setBusy(true);
    setStatusError(null);
    try {
      await removeMemberAttachment(churchId, membership, member, att);
      await onRefresh();
    } catch (err) {
      setStatusError(extractUserErrorMessage(err, 'Gagal menghapus lampiran.'));
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setStatusError(null);
    try {
      await onArchiveToggle(member, !member.archived);
      setConfirmArchive(false);
    } catch (err) {
      setStatusError(extractUserErrorMessage(err, 'Gagal memperbarui status arsip.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke Daftar
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <MemberAvatar
              churchId={churchId}
              membership={membership}
              fullName={member.fullName}
              photoPath={member.photoPath}
              sizeClass="h-16 w-16"
              textClass="text-lg"
            />
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                {member.fullName}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {member.memberCode}
                </span>
                {member.nickname && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>Panggilan: {member.nickname}</span>
                  </>
                )}
                <span aria-hidden="true"> · </span>
                <span className="font-medium text-violet-700 dark:text-violet-400">
                  {getMemberStatusLabelID(member.status)}
                </span>
                {member.archived && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="font-medium text-amber-800 dark:text-amber-300">
                      Diarsipkan
                    </span>
                  </>
                )}
              </p>

              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[#0F1E36] hover:underline dark:text-violet-400">
                <Upload className="h-3 w-3" />
                <span>{member.photoPath ? 'Ganti Foto Profil Privat' : 'Unggah Foto Profil Privat'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void handlePhotoUpload(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(member)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Ubah Profil
            </button>

            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
            >
              {member.archived ? (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Pulihkan
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5" />
                  Arsipkan
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {statusError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {statusError}
        </div>
      )}

      {confirmArchive && (
        <section
          role="alertdialog"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs dark:border-amber-800/80 dark:bg-amber-950/40"
        >
          <p className="text-amber-950 dark:text-amber-100">
            {member.archived
              ? `Pulihkan profil ${member.fullName} kembali ke direktori aktif?`
              : `Arsipkan profil ${member.fullName}? Data tetap tersimpan aman dan dapat dipulihkan kapan saja.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmArchive(false)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleArchiveConfirm()}
              className="rounded-lg bg-amber-800 px-3 py-1.5 font-medium text-white dark:bg-amber-600"
            >
              {busy ? 'Memproses...' : 'Konfirmasi'}
            </button>
          </div>
        </section>
      )}

      {/* Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Data Pribadi &amp; Kontak
          </h3>
          <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Jenis Kelamin</dt>
              <dd className="text-slate-900 dark:text-slate-100">
                {member.gender === 'L' ? 'Laki-laki' : member.gender === 'P' ? 'Perempuan' : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Tanggal Lahir</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {member.birthDate || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Telepon</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100">{member.phone || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="text-slate-900 dark:text-slate-100">{member.email || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Alamat</dt>
              <dd className="max-w-xs text-right text-slate-900 dark:text-slate-100">
                {member.address || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Kontak Darurat</dt>
              <dd className="text-right text-slate-900 dark:text-slate-100">
                {member.emergencyContactName
                  ? `${member.emergencyContactName} (${member.emergencyContactRelation || 'Keluarga'}) · ${member.emergencyContactPhone || '-'}`
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Keanggotaan, Keluarga &amp; Metadata
          </h3>
          <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Tanggal Mulai Anggota</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {member.joinedDate || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Kelompok Keluarga</dt>
              <dd className="text-slate-900 dark:text-slate-100">
                {member.familyGroupName
                  ? `${member.familyGroupName} (${getFamilyRoleLabelID(member.familyRole)})`
                  : 'Belum terhubung'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Kode Ref. Donatur Anonim</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100">
                {member.donorRefCode || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Dibuat pada</dt>
              <dd className="tabular-nums text-slate-700 dark:text-slate-300">
                {formatDateTimeID(member.createdAt, timezone)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Diperbarui pada</dt>
              <dd className="tabular-nums text-slate-700 dark:text-slate-300">
                {formatDateTimeID(member.updatedAt, timezone)}
              </dd>
            </div>
          </dl>

          {member.adminNotes && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Catatan Administratif Owner:
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{member.adminNotes}</p>
            </div>
          )}
        </section>
      </div>

      {/* Private Confidential Attachments */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Dokumen &amp; Lampiran Privat
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Disimpan di Firebase Storage terisolasi tanpa URL publik. Hanya dapat diakses oleh Church Owner.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600">
            <Upload className="h-3.5 w-3.5" />
            <span>Unggah Dokumen (PDF/Gambar)</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handleAttachmentUpload(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {(member.attachments || []).length === 0 ? (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Belum ada lampiran dokumen pada profil ini.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {(member.attachments || []).map((att) => (
              <li key={att.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2.5 text-xs">
                  <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{att.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {Math.round(att.sizeBytes / 1024)} KB · {att.contentType}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handlePreviewAttachment(att)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Eye className="h-3 w-3" />
                    Pratinjau
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDownloadAttachment(att)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3 w-3" />
                    Unduh
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteAttachment(att)}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800/70 dark:text-rose-300 dark:hover:bg-rose-950/50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Inline Ephemeral Attachment Preview Modal */}
      {previewState && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {previewState.name}
              </p>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(previewState.url);
                  setPreviewState(null);
                }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Tutup pratinjau"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 text-center dark:bg-slate-950">
              {previewState.contentType.startsWith('image/') ? (
                <img
                  src={previewState.url}
                  alt={previewState.name}
                  className="mx-auto max-h-[70vh] rounded-lg object-contain"
                />
              ) : (
                <iframe
                  title={previewState.name}
                  src={previewState.url}
                  className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Member Activity Timeline */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Riwayat Perubahan Anggota Ini
        </h3>
        {memberActivities.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Belum ada riwayat perubahan tercatat.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {memberActivities.map((act) => (
              <li key={act.id} className="py-3 text-xs">
                <p className="font-medium text-slate-900 dark:text-slate-100">{act.summary}</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{act.action}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{act.actorEmail}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">{formatDateTimeID(act.createdAt, timezone)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
