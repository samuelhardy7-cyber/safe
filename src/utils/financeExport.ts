import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile, {type SheetData} from 'write-excel-file/browser';
import {buildFinanceCsvExport} from '../domain/finance';
import {hasFinancePermission} from '../domain/rbac';
import {recordFinanceExportAudit} from '../services/financeService';
import type {
  Church,
  ChurchMembership,
  FinanceAccount,
  FinanceTransaction,
} from '../types/domain';
import {triggerEphemeralBlobDownload} from './congregationExport';
import {
  formatCurrency,
  getPaymentMethodLabelID,
  getTxStatusLabelID,
  getTxTypeLabelID,
} from './formatting';

export interface FinanceExportOptions {
  church: Church;
  membership: ChurchMembership;
  reportTitle: string;
  periodLabel: string;
  transactions: readonly FinanceTransaction[];
  accounts: readonly FinanceAccount[];
  totalIncome: number;
  totalExpense: number;
  netSurplus: number;
  totalBalance: number;
}

export async function exportFinanceAsCsv(opts: FinanceExportOptions): Promise<void> {
  if (!hasFinancePermission(opts.membership, 'finance.export')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin finance.export.');
  }
  const csv = buildFinanceCsvExport(opts.transactions, opts.church.currency);
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const stamp = new Date().toISOString().slice(0, 10);
  triggerEphemeralBlobDownload(blob, `higayon-keuangan-${opts.church.id}-${stamp}.csv`);
  await recordFinanceExportAudit(
    opts.church.id,
    opts.membership,
    'csv',
    opts.reportTitle,
    opts.transactions.length,
  );
}

export async function exportFinanceAsXlsx(opts: FinanceExportOptions): Promise<void> {
  if (!hasFinancePermission(opts.membership, 'finance.export')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin finance.export.');
  }

  const headers = [
    'Kode Transaksi',
    'Tanggal',
    'Jenis',
    'Kategori',
    'Deskripsi',
    `Nominal (${opts.church.currency})`,
    'Akun Sumber',
    'Akun Tujuan',
    'Metode',
    'Ref Anonim',
    'Pihak Terkait',
    'No. Bukti',
    'Status',
  ];

  const sheetData: SheetData = [
    [{value: `${opts.church.name} — ${opts.reportTitle} (${opts.periodLabel})`, fontWeight: 'bold', type: String}],
    [
      {value: 'Total Pemasukan:', fontWeight: 'bold', type: String},
      {value: opts.totalIncome, type: Number},
      {value: 'Total Pengeluaran:', fontWeight: 'bold', type: String},
      {value: opts.totalExpense, type: Number},
      {value: 'Surplus/Defisit:', fontWeight: 'bold', type: String},
      {value: opts.netSurplus, type: Number},
      {value: 'Total Saldo Akun:', fontWeight: 'bold', type: String},
      {value: opts.totalBalance, type: Number},
    ],
    [],
    headers.map((h) => ({value: h, fontWeight: 'bold', type: String})),
    ...opts.transactions.map((tx) => [
      {value: tx.txCode, type: String},
      {value: tx.date, type: String},
      {value: getTxTypeLabelID(tx.type), type: String},
      {value: tx.categoryName || '-', type: String},
      {value: tx.description, type: String},
      {value: tx.amount, type: Number},
      {value: tx.accountName, type: String},
      {value: tx.toAccountName || '-', type: String},
      {value: getPaymentMethodLabelID(tx.paymentMethod), type: String},
      {value: tx.anonymousRefCode || '-', type: String},
      {value: tx.counterparty || '-', type: String},
      {value: tx.receiptNumber || '-', type: String},
      {value: getTxStatusLabelID(tx.status), type: String},
    ]),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = await writeXlsxFile(sheetData, {sheet: 'Laporan Keuangan'}).toBlob();
  triggerEphemeralBlobDownload(blob, `higayon-keuangan-${opts.church.id}-${stamp}.xlsx`);
  await recordFinanceExportAudit(
    opts.church.id,
    opts.membership,
    'xlsx',
    opts.reportTitle,
    opts.transactions.length,
  );
}

export async function exportFinanceAsPdf(opts: FinanceExportOptions): Promise<void> {
  if (!hasFinancePermission(opts.membership, 'finance.export')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin finance.export.');
  }

  const doc = new jsPDF({orientation: 'landscape', unit: 'pt', format: 'a4'});
  const cur = opts.church.currency;

  doc.setFontSize(14);
  doc.setTextColor(15, 30, 54);
  doc.text(`${opts.church.name} — ${opts.reportTitle}`, 40, 40);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Periode: ${opts.periodLabel}  |  Diekspor oleh: ${opts.membership.email}  |  Dicetak: ${new Date().toLocaleString('id-ID')}`,
    40,
    58,
  );

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Pemasukan: ${formatCurrency(opts.totalIncome, cur)}   |   Pengeluaran: ${formatCurrency(opts.totalExpense, cur)}   |   Surplus/Defisit: ${formatCurrency(opts.netSurplus, cur)}   |   Saldo Kas Total: ${formatCurrency(opts.totalBalance, cur)}`,
    40,
    78,
  );

  autoTable(doc, {
    startY: 94,
    head: [
      ['Kode', 'Tanggal', 'Jenis', 'Kategori', 'Deskripsi', 'Akun', 'Ref / Vendor', 'Status', `Nominal (${cur})`],
    ],
    body: opts.transactions.map((tx) => [
      tx.txCode,
      tx.date,
      getTxTypeLabelID(tx.type),
      tx.categoryName || (tx.type === 'transfer' ? 'Transfer' : '-'),
      tx.description.slice(0, 60),
      tx.toAccountName ? `${tx.accountName} -> ${tx.toAccountName}` : tx.accountName,
      tx.anonymousRefCode || tx.counterparty || '-',
      getTxStatusLabelID(tx.status),
      formatCurrency(tx.amount, cur),
    ]),
    styles: {fontSize: 8, cellPadding: 4},
    headStyles: {fillColor: [15, 30, 54], textColor: 255},
    columnStyles: {
      8: {halign: 'right'},
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = doc.output('blob');
  triggerEphemeralBlobDownload(blob, `higayon-keuangan-${opts.church.id}-${stamp}.pdf`);
  await recordFinanceExportAudit(
    opts.church.id,
    opts.membership,
    'pdf',
    opts.reportTitle,
    opts.transactions.length,
  );
}
