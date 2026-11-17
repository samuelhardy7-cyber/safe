import React, {useCallback, useEffect, useState} from 'react';
import {
  Archive,
  BarChart3,
  FileSpreadsheet,
  FolderHeart,
  History,
  LayoutDashboard,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {useChurch} from '../../contexts/ChurchContext';
import {DEFAULT_REQUIRED_FIELDS, type MemberFormInput} from '../../domain/congregation';
import {canAccessModule} from '../../domain/rbac';
import {
  archiveOrRestoreMember,
  createCongregationMember,
  fetchCongregationActivities,
  fetchCongregationMembers,
  fetchCongregationRequiredFields,
  fetchFamilyGroups,
  updateCongregationMember,
  uploadMemberPhoto,
} from '../../services/congregationService';
import type {
  CongregationActivity,
  CongregationMember,
  CongregationRequiredField,
  CongregationViewId,
  FamilyGroup,
} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {ArchivedMembersTab} from './ArchivedMembersTab';
import {CongregationActivityTab} from './CongregationActivityTab';
import {CongregationDashboardTab} from './CongregationDashboardTab';
import {FamilyGroupsTab} from './FamilyGroupsTab';
import {ImportExportTab} from './ImportExportTab';
import {MemberDirectoryTab} from './MemberDirectoryTab';
import {MemberFormView} from './MemberFormView';
import {MemberProfileView} from './MemberProfileView';
import {MemberReportsTab} from './MemberReportsTab';
import {MemberSearchTab} from './MemberSearchTab';
import {MemberStatusTab} from './MemberStatusTab';

const SUB_TABS: {id: CongregationViewId; label: string; icon: React.FC<{className?: string}>}[] = [
  {id: 'overview', label: 'Dashboard', icon: LayoutDashboard},
  {id: 'directory', label: 'Direktori', icon: Users},
  {id: 'create', label: 'Tambah Jemaat', icon: Plus},
  {id: 'families', label: 'Keluarga', icon: FolderHeart},
  {id: 'statuses', label: 'Status & Formulir', icon: SlidersHorizontal},
  {id: 'search', label: 'Pencarian', icon: Search},
  {id: 'reports', label: 'Laporan', icon: BarChart3},
  {id: 'import_export', label: 'Impor & Ekspor', icon: FileSpreadsheet},
  {id: 'archived', label: 'Arsip', icon: Archive},
  {id: 'activity', label: 'Riwayat Aktivitas', icon: History},
];

export const CongregationWorkspace: React.FC = () => {
  const {isPlatformAdmin} = useAuth();
  const {activeChurch, activeMembership} = useChurch();

  const [view, setView] = useState<CongregationViewId>('overview');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<CongregationMember[]>([]);
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [activities, setActivities] = useState<CongregationActivity[]>([]);
  const [requiredFields, setRequiredFields] =
    useState<CongregationRequiredField[]>(DEFAULT_REQUIRED_FIELDS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isOwnerAllowed =
    Boolean(activeChurch && activeMembership) &&
    canAccessModule(activeMembership, 'congregation', isPlatformAdmin);

  const loadWorkspaceData = useCallback(async () => {
    if (!activeChurch || !activeMembership || !isOwnerAllowed) {
      setMembers([]);
      setFamilies([]);
      setActivities([]);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const [m, f, a, req] = await Promise.all([
        fetchCongregationMembers(activeChurch.id, activeMembership),
        fetchFamilyGroups(activeChurch.id, activeMembership),
        fetchCongregationActivities(activeChurch.id, activeMembership),
        fetchCongregationRequiredFields(activeChurch.id, activeMembership),
      ]);
      setMembers(m);
      setFamilies(f);
      setActivities(a);
      setRequiredFields(req);
    } catch (err) {
      setLoadError(extractUserErrorMessage(err, 'Gagal memuat data jemaat rahasia.'));
    } finally {
      setLoading(false);
    }
  }, [activeChurch, activeMembership, isOwnerAllowed]);

  // Reset sub-view and reload strictly scoped data whenever active church switches
  useEffect(() => {
    setView('overview');
    setSelectedMemberId(null);
    void loadWorkspaceData();
  }, [activeChurch?.id, loadWorkspaceData]);

  // Strict Owner-only runtime guard (defense-in-depth over Firestore & Storage Rules)
  if (!activeChurch || !activeMembership || !isOwnerAllowed) {
    return (
      <section className="rounded-xl border border-rose-200 bg-white p-8 dark:border-rose-800/70 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-rose-700 dark:text-rose-400" />
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Akses Data Jemaat Ditolak
            </h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Seluruh data jemaat bersifat sangat rahasia dan hanya boleh diakses oleh{' '}
              <strong className="text-slate-900 dark:text-slate-100">Church Owner</strong> pada
              gereja yang aktif. Peran Finance Manager, Finance Staff, Church Staff, maupun Platform
              Admin tidak diperkenankan membaca, mencari, mengimpor, mengekspor, atau melihat
              lampiran jemaat.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const selectedMember = selectedMemberId
    ? members.find((m) => m.id === selectedMemberId) || null
    : null;

  const handleOpenProfile = (member: CongregationMember) => {
    setSelectedMemberId(member.id);
    setView('profile');
  };

  const handleOpenEdit = (member: CongregationMember) => {
    setSelectedMemberId(member.id);
    setView('edit');
  };

  const handleCreateSubmit = async (input: MemberFormInput, photoFile: File | null) => {
    const newId = await createCongregationMember(
      activeChurch.id,
      activeMembership,
      input,
      requiredFields,
      members,
      families,
    );

    if (photoFile) {
      const updated = await fetchCongregationMembers(activeChurch.id, activeMembership);
      const created = updated.find((m) => m.id === newId);
      if (created) {
        await uploadMemberPhoto(activeChurch.id, activeMembership, created, photoFile);
      }
    }

    await loadWorkspaceData();
    setSelectedMemberId(newId);
    setView('profile');
  };

  const handleEditSubmit = async (input: MemberFormInput, photoFile: File | null) => {
    if (!selectedMember) return;
    await updateCongregationMember(
      activeChurch.id,
      activeMembership,
      selectedMember,
      input,
      requiredFields,
      families,
    );

    if (photoFile) {
      await uploadMemberPhoto(activeChurch.id, activeMembership, selectedMember, photoFile);
    }

    await loadWorkspaceData();
    setView('profile');
  };

  const handleArchiveToggle = async (member: CongregationMember, archive: boolean) => {
    await archiveOrRestoreMember(activeChurch.id, activeMembership, member, archive);
    await loadWorkspaceData();
    if (view === 'profile') {
      setView(archive ? 'directory' : 'profile');
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-violet-700 dark:text-violet-400">
              Akses Eksklusif Church Owner
              <span aria-hidden="true"> · </span>
              {activeChurch.name}
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Manajemen Data Jemaat Rahasia
            </h1>
          </div>

          <div className="text-right text-xs text-slate-500 dark:text-slate-400">
            <p>
              Total Non-Arsip:{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {members.filter((m) => !m.archived).length}
              </strong>
              <span aria-hidden="true"> · </span>
              Keluarga:{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {families.filter((f) => !f.archived).length}
              </strong>
            </p>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <nav
          aria-label="Sub-halaman Manajemen Jemaat"
          className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4 dark:border-slate-800"
        >
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const active =
              view === tab.id ||
              (tab.id === 'directory' && (view === 'profile' || view === 'edit'));
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#0F1E36] text-white dark:bg-violet-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </section>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {loadError}
        </div>
      )}

      {loading && members.length === 0 ? (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        </div>
      ) : (
        <>
          {view === 'overview' && (
            <CongregationDashboardTab
              churchName={activeChurch.name}
              timezone={activeChurch.timezone}
              members={members}
              families={families}
              activities={activities}
              onNavigateView={setView}
            />
          )}

          {view === 'directory' && (
            <MemberDirectoryTab
              churchId={activeChurch.id}
              membership={activeMembership}
              members={members}
              families={families}
              onCreateNew={() => setView('create')}
              onViewProfile={handleOpenProfile}
              onEditMember={handleOpenEdit}
              onArchiveMember={(m) => handleArchiveToggle(m, true)}
            />
          )}

          {view === 'create' && (
            <MemberFormView
              mode="create"
              requiredFields={requiredFields}
              families={families}
              onSubmit={handleCreateSubmit}
              onCancel={() => setView('directory')}
            />
          )}

          {view === 'profile' && selectedMember && (
            <MemberProfileView
              churchId={activeChurch.id}
              timezone={activeChurch.timezone}
              membership={activeMembership}
              member={selectedMember}
              activities={activities}
              onBack={() => setView(selectedMember.archived ? 'archived' : 'directory')}
              onEdit={handleOpenEdit}
              onArchiveToggle={handleArchiveToggle}
              onRefresh={loadWorkspaceData}
            />
          )}

          {view === 'edit' && selectedMember && (
            <MemberFormView
              mode="edit"
              initialMember={selectedMember}
              requiredFields={requiredFields}
              families={families}
              onSubmit={handleEditSubmit}
              onCancel={() => setView('profile')}
            />
          )}

          {view === 'families' && (
            <FamilyGroupsTab
              churchId={activeChurch.id}
              membership={activeMembership}
              members={members}
              families={families}
              onViewProfile={handleOpenProfile}
              onRefresh={loadWorkspaceData}
            />
          )}

          {view === 'statuses' && (
            <MemberStatusTab
              churchId={activeChurch.id}
              membership={activeMembership}
              members={members}
              requiredFields={requiredFields}
              onRefresh={loadWorkspaceData}
            />
          )}

          {view === 'search' && (
            <MemberSearchTab
              churchId={activeChurch.id}
              churchName={activeChurch.name}
              membership={activeMembership}
              members={members}
              onViewProfile={handleOpenProfile}
              onEditMember={handleOpenEdit}
            />
          )}

          {view === 'reports' && (
            <MemberReportsTab
              churchId={activeChurch.id}
              churchName={activeChurch.name}
              membership={activeMembership}
              members={members}
              families={families}
              onRefresh={loadWorkspaceData}
            />
          )}

          {view === 'import_export' && (
            <ImportExportTab
              churchId={activeChurch.id}
              membership={activeMembership}
              members={members}
              requiredFields={requiredFields}
              onRefresh={loadWorkspaceData}
            />
          )}

          {view === 'archived' && (
            <ArchivedMembersTab
              churchId={activeChurch.id}
              timezone={activeChurch.timezone}
              membership={activeMembership}
              members={members}
              onViewProfile={handleOpenProfile}
              onRestoreMember={(m) => handleArchiveToggle(m, false)}
            />
          )}

          {view === 'activity' && (
            <CongregationActivityTab timezone={activeChurch.timezone} activities={activities} />
          )}
        </>
      )}
    </div>
  );
};
