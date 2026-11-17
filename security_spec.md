# Higayon Church Management — Security Specification (Prompt 1 + Prompt 2 + Prompt 3)

## 1. Data Invariants
1. **Default Deny**: Every Firestore path and Storage path is denied by default unless explicitly permitted by tenant, role, permission, and schema gates.
2. **Strict Tenant Isolation**: A document inside `/churches/{churchId}/...` can never be read or modified by a user who does not hold an `active` membership in that exact `churchId`.
3. **Owner-Only Congregation Data**: `/churches/{churchId}/congregationMembers/{memberId}`, `/churches/{churchId}/familyGroups/{groupId}`, `/churches/{churchId}/congregationActivities/{activityId}`, `/churches/{churchId}/settings/congregation`, and Storage `/churches/{churchId}/congregation/...` are accessible **exclusively** to the active `owner` of `churchId`. Finance Manager, Finance Staff, Church Staff, and Platform Administrator are unconditionally denied.
4. **Strict Separation of Congregation & Finance**: No Finance collection references, joins, or exposes `congregationMembers`. Donor references in Finance use opaque non-identity codes (`anonymousRefCode`); mapping lives strictly inside Owner-only `congregationMembers`.
5. **13 Granular Financial Permissions**: Only the active `owner` (always full access) and `finance_manager` / `finance_staff` explicitly granted individual permissions by the Owner may access Finance operations (`finance.view`, `finance.create`, `finance.editDraft`, `finance.submit`, `finance.approve`, `finance.reject`, `finance.void`, `finance.export`, `finance.viewReports`, `finance.viewReceipts`, `finance.manageAccounts`, `finance.manageCategories`, `finance.manageSettings`). `church_staff` always has zero finance permissions.
6. **Integer Money & Transactional Balances**: All financial amounts and balances (`amount`, `openingBalance`, `currentBalance`, `requireReceiptAboveAmount`) must be exact integers (`int`). Users can never manually overwrite `currentBalance`; balances mutate solely via transactional approval/void flows.
7. **Transaction State Machine & Segregation of Duties**: Transactions follow `draft -> submitted -> approved -> locked` (or `submitted -> rejected`, `approved/locked -> voided`). Non-Owner approvers cannot approve transactions they created (`createdBy != request.auth.uid`); Owner self-approval requires a mandatory `overrideReason` recorded in audit logs.
8. **Private Financial Receipts**: Storage `/churches/{churchId}/finance/...` requires `finance.viewReceipts` (or `owner`) for reads and `finance.create`/`finance.editDraft` for uploads (max 5 MB, `jpeg/png/webp/pdf`). No public URLs are stored or shared.
9. **Verified Email & No Self-Escalation**: All writes require `request.auth.token.email_verified == true`. Only `owner` can modify `memberships` permissions.
10. **Immutable Audit Trail**: `auditLogs`, `financeAuditLogs`, and `congregationActivities` are append-only (`update` and `delete` strictly forbidden).

## 2. Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-Tenant Finance Read**: Owner of `church-a` queries `financeTransactions` of `church-b` -> `PERMISSION_DENIED`.
2. **Finance Manager Reading Congregation**: `finance_manager` calls `getDoc` or `getDocs` on `congregationMembers` -> `PERMISSION_DENIED`.
3. **Church Staff Reading Finance**: `church_staff` calls `getDoc` or `list` on `financeTransactions` or `financeAccounts` -> `PERMISSION_DENIED`.
4. **Staff Self-Escalation**: `finance_staff` updates own `memberships/{uid}` to add `finance.approve` -> `PERMISSION_DENIED`.
5. **Finance Manager Granting Permissions**: `finance_manager` updates another user's `memberships/{uid}` -> `PERMISSION_DENIED`.
6. **Draft Staff Approving Transaction**: `finance_staff` without `finance.approve` updates `status` from `submitted` to `approved` -> `PERMISSION_DENIED`.
7. **Non-Owner Self-Approval**: `finance_manager` with `finance.approve` attempts to approve a transaction where `createdBy == request.auth.uid` -> `PERMISSION_DENIED`.
8. **Float Amount Injection**: User submits `amount: 10000.55` or `amount: -500` in `financeTransactions` -> `PERMISSION_DENIED` (`is int && > 0`).
9. **Receipt Read Without Permission**: `finance_staff` without `finance.viewReceipts` reads Storage `churches/{churchId}/finance/...` -> `PERMISSION_DENIED`.
10. **Manual Balance Tampering**: User without `finance.manageAccounts` or during normal edit modifies `currentBalance` directly or edits `openingBalance` after creation -> `PERMISSION_DENIED`.
11. **Approved/Locked Transaction Tampering**: User attempts to edit `amount` or `description` after `status` reaches `approved` or `locked` -> `PERMISSION_DENIED`.
12. **Audit Log Deletion / Update**: User or Owner attempts `update` or `delete` on `financeAuditLogs` -> `PERMISSION_DENIED`.
