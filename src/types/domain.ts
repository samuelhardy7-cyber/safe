export type ChurchRole = 'owner' | 'finance_manager' | 'finance_staff' | 'church_staff';

export type MembershipStatus = 'active' | 'suspended' | 'revoked';

export type GranularFinancePermission =
  | 'finance.view'
  | 'finance.create'
  | 'finance.editDraft'
  | 'finance.submit'
  | 'finance.approve'
  | 'finance.reject'
  | 'finance.void'
  | 'finance.export'
  | 'finance.viewReports'
  | 'finance.viewReceipts'
  | 'finance.manageAccounts'
  | 'finance.manageCategories'
  | 'finance.manageSettings';

export type LegacyFinancePermission =
  | 'finance:read'
  | 'finance:create'
  | 'finance:edit'
  | 'finance:approve'
  | 'finance:export'
  | 'reports:finance';

export type FinancePermission = GranularFinancePermission | LegacyFinancePermission;

export type StaffPermission = 'dashboard:basic' | 'church:view_profile';

export type NavModuleId =
  | 'dashboard'
  | 'congregation'
  | 'finance'
  | 'reports'
  | 'users'
  | 'backup'
  | 'audit'
  | 'church_settings'
  | 'account_settings'
  | 'platform_admin';

export type CurrencyCode = 'IDR' | 'USD' | 'SGD';
export type LocaleCode = 'id-ID' | 'en-US';
export type LanguageCode = 'id' | 'en';

export type CongregationMemberStatus = 'active' | 'inactive' | 'visiting' | 'moved' | 'deceased';
export type FamilyRole = '' | 'head' | 'spouse' | 'child' | 'parent' | 'other';
export type CongregationRequiredField =
  | 'fullName'
  | 'nickname'
  | 'gender'
  | 'birthDate'
  | 'phone'
  | 'email'
  | 'address'
  | 'joinedDate'
  | 'status'
  | 'familyGroupId';

export type CongregationViewId =
  | 'overview'
  | 'directory'
  | 'create'
  | 'profile'
  | 'edit'
  | 'families'
  | 'statuses'
  | 'search'
  | 'reports'
  | 'import_export'
  | 'archived'
  | 'activity';

export interface CongregationAttachment {
  id: string;
  name: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CongregationMember {
  id: string;
  churchId: string;
  ownerUid: string;
  memberCode: string;
  fullName: string;
  nickname?: string;
  photoPath?: string;
  gender?: '' | 'L' | 'P';
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  joinedDate?: string;
  status: CongregationMemberStatus;
  familyGroupId?: string;
  familyGroupName?: string;
  familyRole?: FamilyRole;
  donorRefCode?: string;
  adminNotes?: string;
  attachments?: CongregationAttachment[];
  archived: boolean;
  archivedAt?: unknown;
  archivedBy?: string;
  version?: number;
  createdBy: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FamilyGroup {
  id: string;
  churchId: string;
  ownerUid: string;
  familyCode: string;
  name: string;
  headMemberId?: string;
  notes?: string;
  archived: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CongregationActivity {
  id: string;
  churchId: string;
  ownerUid: string;
  memberId?: string;
  memberCode?: string;
  action: string;
  summary: string;
  actorUid: string;
  actorEmail: string;
  createdAt?: unknown;
}

// ============================================================
// PRIVATE FINANCIAL MANAGEMENT (Prompt 3)
// ============================================================

export type FinanceViewId =
  | 'overview'
  | 'income'
  | 'expenses'
  | 'transactions'
  | 'accounts'
  | 'categories'
  | 'approvals'
  | 'receipts'
  | 'reports'
  | 'export'
  | 'settings'
  | 'audit';

export type FinanceAccountType = 'cash' | 'bank' | 'operational' | 'building' | 'other';
export type FinanceAccountStatus = 'active' | 'inactive' | 'archived';

export interface FinanceAccount {
  id: string;
  churchId: string;
  ownerUid: string;
  name: string;
  accountType: FinanceAccountType;
  currency: CurrencyCode;
  openingBalance: number;
  currentBalance: number;
  status: FinanceAccountStatus;
  notes?: string;
  authorizedViewerUids?: string[];
  createdBy: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type FinanceCategoryType = 'income' | 'expense';

export interface FinanceCategory {
  id: string;
  churchId: string;
  ownerUid: string;
  type: FinanceCategoryType;
  code: string;
  name: string;
  description?: string;
  color: string;
  status: 'active' | 'inactive';
  authorizedViewerUids?: string[];
  createdBy: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type FinanceTransactionType = 'income' | 'expense' | 'transfer';
export type FinanceTransactionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'locked'
  | 'rejected'
  | 'voided';

export type FinancePaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'qris'
  | 'debit_card'
  | 'check'
  | 'other';

export interface FinanceAttachment {
  id: string;
  name: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface FinanceTransaction {
  id: string;
  txCode: string;
  churchId: string;
  ownerUid: string;
  type: FinanceTransactionType;
  date: string; // YYYY-MM-DD
  categoryId?: string;
  categoryName?: string;
  description: string;
  amount: number; // Integer Rupiah / smallest unit
  accountId: string;
  accountName: string;
  toAccountId?: string;
  toAccountName?: string;
  paymentMethod: FinancePaymentMethod;
  anonymousRefCode?: string;
  counterparty?: string;
  receiptNumber?: string;
  attachments?: FinanceAttachment[];
  status: FinanceTransactionStatus;
  idempotencyKey: string;
  rejectionReason?: string;
  voidReason?: string;
  overrideReason?: string;
  authorizedViewerUids?: string[];
  createdBy: string;
  createdByEmail: string;
  submittedBy?: string;
  submittedAt?: unknown;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: unknown;
  lockedAt?: unknown;
  rejectedBy?: string;
  rejectedAt?: unknown;
  voidedBy?: string;
  voidedAt?: unknown;
  version?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FinanceSettings {
  churchId: string;
  ownerUid: string;
  requireReceiptAboveAmount: number;
  allowOwnerSelfApproveOverride: boolean;
  autoLockOnApproval: boolean;
  defaultPaymentMethod: FinancePaymentMethod;
  fiscalLockBeforeDate?: string;
  authorizedViewerUids?: string[];
  updatedBy: string;
  updatedAt?: unknown;
}

export interface FinanceAuditLog {
  id: string;
  churchId: string;
  ownerUid: string;
  action: string;
  targetType: string;
  targetId: string;
  txCode?: string;
  summary: string;
  actorUid: string;
  actorEmail: string;
  actorRole: ChurchRole;
  authorizedViewerUids?: string[];
  createdAt?: unknown;
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  photoURL?: string;
  defaultChurchId?: string;
  locale: LocaleCode;
  pinEnabled: boolean;
  pinHash?: string;
  mfaAcknowledged: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserChurchRef {
  uid: string;
  churchId: string;
  churchName: string;
  role: ChurchRole;
  status: MembershipStatus;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export interface Church {
  id: string;
  name: string;
  denomination?: string;
  city: string;
  country: string;
  timezone: string;
  currency: CurrencyCode;
  language: LanguageCode;
  ownerId: string;
  status: 'active' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChurchSettings {
  churchId: string;
  ownerUid: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  fiscalYearStartMonth: number;
  requireMfaForFinanceApproval: boolean;
  requirePinForSensitiveActions: boolean;
  sessionTimeoutMinutes: number;
  automatedBackupEnabled?: boolean;
  congregationRequiredFields?: CongregationRequiredField[];
  updatedBy: string;
  updatedAt?: unknown;
}

export interface ChurchMembership {
  uid: string;
  churchId: string;
  ownerUid: string;
  displayName: string;
  email: string;
  role: ChurchRole;
  status: MembershipStatus;
  financePermissions: FinancePermission[];
  staffPermissions: StaffPermission[];
  invitedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChurchInvitation {
  id: string;
  churchId: string;
  churchName: string;
  ownerUid: string;
  invitedEmail: string;
  role: Exclude<ChurchRole, 'owner'>;
  financePermissions: FinancePermission[];
  staffPermissions: StaffPermission[];
  status: 'pending' | 'accepted' | 'revoked';
  invitedBy: string;
  acceptedByUid?: string;
  acceptedAt?: unknown;
  createdAt?: unknown;
  expiresAt?: unknown;
}

export interface AuditLogEntry {
  id: string;
  churchId: string;
  ownerUid: string;
  actorUid: string;
  actorEmail: string;
  actorRole: ChurchRole;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt?: unknown;
}

export interface BackupRecordSummary {
  members: number;
  families: number;
  accounts: number;
  categories: number;
  transactions: number;
  auditLogs: number;
}

export interface BackupRecord {
  id: string;
  churchId: string;
  ownerUid: string;
  createdBy: string;
  scope: 'full' | 'settings_and_rbac' | 'finance_only';
  backupType?: 'manual' | 'scheduled' | 'pre_restore';
  checksum: string;
  sizeBytes?: number;
  storagePath?: string;
  restoredFromBackupId?: string;
  recordSummary?: BackupRecordSummary;
  status: 'completed' | 'verified';
  createdAt?: unknown;
}

export interface OwnershipTransferRequest {
  id: string;
  churchId: string;
  ownerUid: string;
  fromUid: string;
  fromEmail: string;
  toUid: string;
  toEmail: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt?: unknown;
  updatedAt?: unknown;
  expiresAt?: unknown;
}

export interface PlatformAdminRecord {
  uid: string;
  email: string;
  status: 'active' | 'suspended';
  createdAt?: unknown;
}
