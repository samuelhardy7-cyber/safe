import React, {useMemo, useState} from 'react';
import {Edit3, Plus, Sparkles, Tag, X} from 'lucide-react';
import {hasFinancePermission} from '../../domain/rbac';
import {
  createFinanceCategory,
  seedDefaultFinanceCategories,
  updateFinanceCategory,
} from '../../services/financeService';
import type {
  ChurchMembership,
  FinanceCategory,
  FinanceCategoryType,
} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface CategoriesTabProps {
  churchId: string;
  membership: ChurchMembership;
  categories: readonly FinanceCategory[];
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

const PRESET_COLORS = [
  '#0F766E',
  '#0369A1',
  '#0284C7',
  '#4338CA',
  '#0D9488',
  '#B45309',
  '#BE123C',
  '#9F1239',
  '#475569',
  '#991B1B',
];

export const CategoriesTab: React.FC<CategoriesTabProps> = ({
  churchId,
  membership,
  categories,
  onNotice,
  onError,
}) => {
  const canManage = hasFinancePermission(membership, 'finance.manageCategories');
  const [seeding, setSeeding] = useState(false);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingCat, setEditingCat] = useState<FinanceCategory | null>(null);
  const [catType, setCatType] = useState<FinanceCategoryType>('income');
  const [catCode, setCatCode] = useState('');
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catColor, setCatColor] = useState('#0F766E');
  const [catStatus, setCatStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories],
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  );

  const openCreate = (type: FinanceCategoryType) => {
    setModalMode('create');
    setEditingCat(null);
    setCatType(type);
    setCatCode(type === 'income' ? 'INC-' : 'EXP-');
    setCatName('');
    setCatDesc('');
    setCatColor(type === 'income' ? '#0F766E' : '#BE123C');
    setCatStatus('active');
  };

  const openEdit = (cat: FinanceCategory) => {
    setModalMode('edit');
    setEditingCat(cat);
    setCatType(cat.type);
    setCatCode(cat.code);
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setCatColor(cat.color || '#0F766E');
    setCatStatus(cat.status);
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const added = await seedDefaultFinanceCategories(churchId, membership, categories);
      if (added === 0) {
        onNotice('Seluruh kategori standar Indonesia sudah tersedia di gereja ini.');
      } else {
        onNotice(`${added} kategori pemasukan dan pengeluaran standar berhasil ditambahkan.`);
      }
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal mengisi kategori standar.'));
    } finally {
      setSeeding(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createFinanceCategory(churchId, membership, {
          type: catType,
          code: catCode,
          name: catName,
          description: catDesc,
          color: catColor,
        });
        onNotice(`Kategori "${catName.trim()}" berhasil ditambahkan.`);
      } else if (modalMode === 'edit' && editingCat) {
        await updateFinanceCategory(churchId, membership, editingCat, {
          code: catCode,
          name: catName,
          description: catDesc,
          color: catColor,
          status: catStatus,
        });
        onNotice(`Kategori "${catName.trim()}" berhasil diperbarui.`);
      }
      setModalMode(null);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal menyimpan kategori keuangan.'));
    } finally {
      setSaving(false);
    }
  };

  const renderCategoryColumn = (
    title: string,
    subtitle: string,
    type: FinanceCategoryType,
    list: readonly FinanceCategory[],
  ) => (
    <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {title} ({list.length})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => openCreate(type)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
          Belum ada kategori terdaftar pada kelompok ini.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((cat) => (
            <li key={cat.id} className="flex items-start justify-between gap-3 py-3 text-xs">
              <div className="flex items-start gap-3 min-w-0">
                <span
                  aria-hidden="true"
                  className="mt-1 h-3.5 w-3.5 shrink-0 rounded"
                  style={{backgroundColor: cat.color || '#0F766E'}}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {cat.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {cat.code}
                    </span>
                    {cat.status === 'inactive' && (
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        · Nonaktif
                      </span>
                    )}
                  </div>
                  {cat.description && (
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {cat.description}
                    </p>
                  )}
                </div>
              </div>

              {canManage && (
                <button
                  type="button"
                  onClick={() => openEdit(cat)}
                  aria-label={`Ubah kategori ${cat.name}`}
                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Tag className="h-5 w-5 text-violet-700 dark:text-violet-400" />
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Struktur Kategori Akun Keuangan Gereja
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kategori memisahkan sumber persembahan/pendapatan dan pos belanja secara konsisten pada
              laporan.
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedDefaults()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            {seeding ? 'Mengisi...' : 'Isi Kategori Standar Indonesia'}
          </button>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {renderCategoryColumn(
          'Kategori Pemasukan',
          'Persembahan mingguan, perpuluhan, ucapan syukur, misi, dan pembangunan.',
          'income',
          incomeCategories,
        )}
        {renderCategoryColumn(
          'Kategori Pengeluaran',
          'Operasional, pelayanan diakonia, ibadah, pemeliharaan aset, dan honorarium.',
          'expense',
          expenseCategories,
        )}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {modalMode === 'create'
                  ? `Tambah Kategori ${catType === 'income' ? 'Pemasukan' : 'Pengeluaran'}`
                  : `Ubah Kategori: ${editingCat?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                aria-label="Tutup modal kategori"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="mt-4 space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cat-code" className="block font-medium text-slate-700 dark:text-slate-300">
                    Kode Kategori *
                  </label>
                  <input
                    id="cat-code"
                    type="text"
                    required
                    value={catCode}
                    onChange={(e) => setCatCode(e.target.value.toUpperCase())}
                    placeholder="INC-KHUSUS"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {modalMode === 'edit' && (
                  <div>
                    <label
                      htmlFor="cat-status"
                      className="block font-medium text-slate-700 dark:text-slate-300"
                    >
                      Status
                    </label>
                    <select
                      id="cat-status"
                      value={catStatus}
                      onChange={(e) => setCatStatus(e.target.value as 'active' | 'inactive')}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="active">Aktif</option>
                      <option value="inactive">Nonaktif</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="cat-name" className="block font-medium text-slate-700 dark:text-slate-300">
                  Nama Kategori *
                </label>
                <input
                  id="cat-name"
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Contoh: Dana Beasiswa Diakonia"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="cat-desc" className="block font-medium text-slate-700 dark:text-slate-300">
                  Deskripsi (Opsional)
                </label>
                <textarea
                  id="cat-desc"
                  rows={2}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <span className="block font-medium text-slate-700 dark:text-slate-300">
                  Warna Indikator Grafik
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setCatColor(hex)}
                      aria-label={`Pilih warna ${hex}`}
                      className={`h-6 w-6 rounded-md transition-transform ${
                        catColor === hex ? 'scale-110 ring-2 ring-slate-900 dark:ring-white' : ''
                      }`}
                      style={{backgroundColor: hex}}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F1E36] px-4 py-2 font-medium text-white hover:bg-[#162A4A] disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Kategori'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
