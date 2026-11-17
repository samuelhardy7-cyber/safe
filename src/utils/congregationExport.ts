import writeXlsxFile, {type SheetData} from 'write-excel-file/browser';
import {buildCsvExport} from '../domain/congregation';
import type {ChurchMembership, CongregationMember} from '../types/domain';
import {recordCongregationExportAudit} from '../services/congregationService';
import {getMemberStatusLabelID, getFamilyRoleLabelID} from './formatting';

export function triggerEphemeralBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportMembersAsCsv(
  churchId: string,
  membership: ChurchMembership | null | undefined,
  members: readonly CongregationMember[],
  reportKind = 'direktori_jemaat',
): Promise<void> {
  const csv = buildCsvExport(members);
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const stamp = new Date().toISOString().slice(0, 10);
  triggerEphemeralBlobDownload(blob, `higayon-${reportKind}-${churchId}-${stamp}.csv`);
  await recordCongregationExportAudit(churchId, membership, 'csv', members.length, reportKind);
}

export async function exportMembersAsXlsx(
  churchId: string,
  membership: ChurchMembership | null | undefined,
  members: readonly CongregationMember[],
  reportKind = 'direktori_jemaat',
): Promise<void> {
  const headers = [
    'Kode Anggota',
    'Nama Lengkap',
    'Nama Panggilan',
    'Jenis Kelamin',
    'Tanggal Lahir',
    'Telepon',
    'Email',
    'Alamat',
    'Tanggal Anggota',
    'Status',
    'Kelompok Keluarga',
    'Peran Keluarga',
    'Kode Referensi Donatur',
    'Catatan Administratif',
  ];

  const sheetData: SheetData = [
    headers.map((h) => ({value: h, fontWeight: 'bold', type: String})),
    ...members.map((m) => [
      {value: m.memberCode, type: String},
      {value: m.fullName, type: String},
      {value: m.nickname || '', type: String},
      {value: m.gender || '', type: String},
      {value: m.birthDate || '', type: String},
      {value: m.phone || '', type: String},
      {value: m.email || '', type: String},
      {value: m.address || '', type: String},
      {value: m.joinedDate || '', type: String},
      {value: getMemberStatusLabelID(m.status), type: String},
      {value: m.familyGroupName || '', type: String},
      {value: m.familyGroupId ? getFamilyRoleLabelID(m.familyRole) : '', type: String},
      {value: m.donorRefCode || '', type: String},
      {value: m.adminNotes || '', type: String},
    ]),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = await writeXlsxFile(sheetData, {sheet: 'Data Jemaat'}).toBlob();
  triggerEphemeralBlobDownload(blob, `higayon-${reportKind}-${churchId}-${stamp}.xlsx`);
  await recordCongregationExportAudit(churchId, membership, 'xlsx', members.length, reportKind);
}

export async function downloadImportTemplateXlsx(): Promise<void> {
  const headers = [
    'Nama Lengkap',
    'Nama Panggilan',
    'Jenis Kelamin',
    'Tanggal Lahir',
    'Telepon',
    'Email',
    'Alamat',
    'Tanggal Anggota',
    'Status',
    'Catatan Administratif',
  ];

  const sampleRow = [
    'Contoh: Yohanes Santoso',
    'Yohanes',
    'L',
    '1988-05-14',
    '081234567890',
    'contoh@gereja.id',
    'Jl. Damai Sejahtera No. 12',
    '2022-01-10',
    'Aktif',
    'Hapus baris contoh ini sebelum mengimpor',
  ];

  const sheetData: SheetData = [
    headers.map((h) => ({value: h, fontWeight: 'bold', type: String})),
    sampleRow.map((val) => ({value: val, type: String})),
  ];

  const blob = await writeXlsxFile(sheetData, {sheet: 'Template Impor'}).toBlob();
  triggerEphemeralBlobDownload(blob, 'template-impor-jemaat-higayon.xlsx');
}
