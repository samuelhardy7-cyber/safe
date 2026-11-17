import React, {useState} from 'react';
import {AlertCircle, ArrowLeft, Save, Shield} from 'lucide-react';
import {
  ALLOWED_MEMBER_STATUSES,
  type MemberFormInput,
  validateMemberForm,
} from '../../domain/congregation';
import type {
  CongregationMember,
  CongregationRequiredField,
  FamilyGroup,
  FamilyRole,
} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {getFamilyRoleLabelID, getMemberStatusLabelID} from '../../utils/formatting';

interface MemberFormViewProps {
  mode: 'create' | 'edit';
  initialMember?: CongregationMember | null;
  requiredFields: readonly CongregationRequiredField[];
  families: readonly FamilyGroup[];
  onSubmit: (input: MemberFormInput, photoFile: File | null) => Promise<void>;
  onCancel: () => void;
}

const FAMILY_ROLES: FamilyRole[] = ['', 'head', 'spouse', 'child', 'parent', 'other'];

export const MemberFormView: React.FC<MemberFormViewProps> = ({
  mode,
  initialMember,
  requiredFields,
  families,
  onSubmit,
  onCancel,
}) => {
  const reqSet = new Set(requiredFields);

  const [form, setForm] = useState<MemberFormInput>({
    fullName: initialMember?.fullName || '',
    nickname: initialMember?.nickname || '',
    gender: initialMember?.gender || '',
    birthDate: initialMember?.birthDate || '',
    phone: initialMember?.phone || '',
    email: initialMember?.email || '',
    address: initialMember?.address || '',
    emergencyContactName: initialMember?.emergencyContactName || '',
    emergencyContactPhone: initialMember?.emergencyContactPhone || '',
    emergencyContactRelation: initialMember?.emergencyContactRelation || '',
    joinedDate: initialMember?.joinedDate || '',
    status: initialMember?.status || 'active',
    familyGroupId: initialMember?.familyGroupId || '',
    familyRole: initialMember?.familyRole || '',
    donorRefCode: initialMember?.donorRefCode || '',
    adminNotes: initialMember?.adminNotes || '',
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isReq = (field: CongregationRequiredField) => reqSet.has(field);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validation = validateMemberForm(form, requiredFields);
    if (!validation.valid) {
      setErrorMessage(validation.errors[0]);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit(form, photoFile);
    } catch (err) {
      setErrorMessage(extractUserErrorMessage(err, 'Gagal menyimpan data jemaat.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali
          </button>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'create'
              ? 'Tambah Profil Jemaat Baru'
              : `Ubah Profil Jemaat · ${initialMember?.memberCode || ''}`}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Prinsip minimisasi data diterapkan: tidak mengumpulkan NIK, nomor KTP, atau riwayat kesehatan.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Shield className="h-4 w-4 text-violet-700 dark:text-violet-400" />
          <span>Khusus Church Owner</span>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Section 1: Basic Information */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Informasi Dasar
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nama Lengkap <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((p) => ({...p, fullName: e.target.value}))}
              placeholder="Contoh: Yohanes Santoso"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nama Panggilan{' '}
              {isReq('nickname') && <span className="text-rose-600 dark:text-rose-400">*</span>}
            </label>
            <input
              type="text"
              value={form.nickname || ''}
              onChange={(e) => setForm((p) => ({...p, nickname: e.target.value}))}
              placeholder="Opsional"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Jenis Kelamin{' '}
              {isReq('gender') && <span className="text-rose-600 dark:text-rose-400">*</span>}
            </label>
            <select
              value={form.gender || ''}
              onChange={(e) => setForm((p) => ({...p, gender: e.target.value as '' | 'L' | 'P'}))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            >
              <option value="">Tidak ditentukan</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Tanggal Lahir{' '}
              {isReq('birthDate') && <span className="text-rose-600 dark:text-rose-400">*</span>}
            </label>
            <input
              type="date"
              value={form.birthDate || ''}
              onChange={(e) => setForm((p) => ({...p, birthDate: e.target.value}))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Foto Profil Privat (Opsional · Maks 5 MB, JPG/PNG/WebP)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              className="mt-1.5 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-100 dark:text-slate-400 dark:file:border-slate-700 dark:file:bg-slate-800 dark:file:text-slate-200 dark:hover:file:bg-slate-700"
            />
          </div>
        </div>
      </section>

      {/* Section 2: Contact & Emergency Contact */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Informasi Kontak &amp; Darurat
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nomor Telepon / WhatsApp{' '}
              {isReq('phone') && <span className="text-rose-600 dark:text-rose-400">*</span>}
            </label>
            <input
              type="tel"
              value={form.phone || ''}
              onChange={(e) => setForm((p) => ({...p, phone: e.target.value}))}
              placeholder="0812..."
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Alamat Email{' '}
              {isReq('email') && <span className="text-rose-600 dark:text-rose-400">*</span>}
            </label>
            <input
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm((p) => ({...p, email: e.target.value}))}
              placeholder="nama@domain.id"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Alamat Tempat Tinggal{' '}
              {isReq('address') && <span className="text-rose-600 dark:text-rose-400">*</span>}
            </label>
            <textarea
              rows={2}
              value={form.address || ''}
              onChange={(e) => setForm((p) => ({...p, address: e.target.value}))}
              placeholder="Alamat tempat tinggal saat ini (opsional)"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nama Kontak Darurat (Opsional)
            </label>
            <input
              type="text"
              value={form.emergencyContactName || ''}
              onChange={(e) => setForm((p) => ({...p, emergencyContactName: e.target.value}))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Telepon Kontak Darurat &amp; Hubungan (Opsional)
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <input
                type="tel"
                value={form.emergencyContactPhone || ''}
                onChange={(e) => setForm((p) => ({...p, emergencyContactPhone: e.target.value}))}
                placeholder="No. telepon"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
              />
              <input
                type="text"
                value={form.emergencyContactRelation || ''}
                onChange={(e) =>
                  setForm((p) => ({...p, emergencyContactRelation: e.target.value}))
                }
                placeholder="Hubungan (mis. Pasangan)"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Membership & Family */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Informasi Keanggotaan &amp; Keluarga
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Status Keanggotaan <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((p) => ({...p, status: e.target.value as MemberFormInput['status']}))
              }
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            >
              {ALLOWED_MEMBER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {getMemberStatusLabelID(st)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Tanggal Mulai Anggota{' '}
              {isReq('joinedDate') && <span className="text-rose-600 dark:text-rose-400">*</span>}
            </label>
            <input
              type="date"
              value={form.joinedDate || ''}
              onChange={(e) => setForm((p) => ({...p, joinedDate: e.target.value}))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Kelompok Keluarga{' '}
              {isReq('familyGroupId') && (
                <span className="text-rose-600 dark:text-rose-400">*</span>
              )}
            </label>
            <select
              value={form.familyGroupId || ''}
              onChange={(e) => setForm((p) => ({...p, familyGroupId: e.target.value}))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            >
              <option value="">Belum terhubung kelompok keluarga</option>
              {families
                .filter((f) => !f.archived)
                .map((fam) => (
                  <option key={fam.id} value={fam.id}>
                    {fam.familyCode} — {fam.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Peran dalam Keluarga
            </label>
            <select
              disabled={!form.familyGroupId}
              value={form.familyGroupId ? form.familyRole || 'other' : ''}
              onChange={(e) => setForm((p) => ({...p, familyRole: e.target.value as FamilyRole}))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
            >
              {FAMILY_ROLES.map((r) => (
                <option key={r || 'none'} value={r}>
                  {getFamilyRoleLabelID(r)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Kode Referensi Donatur Anonim (Opsional)
            </label>
            <input
              type="text"
              value={form.donorRefCode || ''}
              onChange={(e) => setForm((p) => ({...p, donorRefCode: e.target.value}))}
              placeholder="Mis. REF-042 (hanya terlihat oleh Owner)"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Catatan Administratif Internal (Hanya Owner)
            </label>
            <textarea
              rows={3}
              value={form.adminNotes || ''}
              onChange={(e) => setForm((p) => ({...p, adminNotes: e.target.value}))}
              placeholder="Catatan pastoral atau administratif yang bersifat rahasia..."
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F1E36] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500"
            />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F1E36] px-5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
        >
          <Save className="h-3.5 w-3.5" />
          {submitting
            ? 'Menyimpan...'
            : mode === 'create'
              ? 'Simpan Jemaat Baru'
              : 'Simpan Perubahan'}
        </button>
      </div>
    </form>
  );
};
