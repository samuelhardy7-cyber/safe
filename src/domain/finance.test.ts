import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinanceCsvExport,
  canApproveTransaction,
  canEditTransactionDraft,
  canRejectTransaction,
  canSubmitTransaction,
  canVoidTransaction,
  computeAccountMutationLedger,
  computeApprovalBalanceDeltas,
  computeFinanceDashboardMetrics,
  computeVoidBalanceDeltas,
  resolveDateRange,
  validateAnonymousRefCode,
  validateSafeIntegerAmount,
  validateTransactionInput,
} from './finance';
import type {
  ChurchMembership,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
} from '../types/domain';

function makeMembership(overrides: Partial<ChurchMembership>): ChurchMembership {
  return {
    uid: 'user-1',
    churchId: 'church-a',
    ownerUid: 'owner-1',
    displayName: 'Bendahara',
    email: 'bendahara@gereja.id',
    role: 'finance_staff',
    status: 'active',
    financePermissions: ['finance.view'],
    staffPermissions: ['dashboard:basic'],
    invitedBy: 'owner-1',
    ...overrides,
  };
}

function makeTx(overrides: Partial<FinanceTransaction>): FinanceTransaction {
  return {
    id: 'tx-1',
    txCode: 'TX-202604-001',
    churchId: 'church-a',
    ownerUid: 'owner-1',
    type: 'income',
    date: '2026-04-12',
    categoryId: 'cat-1',
    categoryName: 'Persembahan Mingguan',
    description: 'Kolekte Ibadah Pagi',
    amount: 5000000,
    accountId: 'acc-1',
    accountName: 'Kas Utama',
    paymentMethod: 'cash',
    status: 'submitted',
    idempotencyKey: 'idem-0001',
    createdBy: 'staff-1',
    createdByEmail: 'staff@gereja.id',
    ...overrides,
  };
}

test('validateSafeIntegerAmount enforces integer-only money and rejects decimals or negatives', () => {
  assert.deepEqual(validateSafeIntegerAmount(250000), {valid: true, value: 250000});
  assert.deepEqual(validateSafeIntegerAmount('1500000'), {valid: true, value: 1500000});
  assert.equal(validateSafeIntegerAmount(1000.5).valid, false);
  assert.equal(validateSafeIntegerAmount('1000.50').valid, false);
  assert.equal(validateSafeIntegerAmount(0).valid, false);
  assert.equal(validateSafeIntegerAmount(-5000).valid, false);
  assert.equal(validateSafeIntegerAmount(0, true).valid, true);
});

test('validateAnonymousRefCode blocks email/PII injection and accepts opaque codes', () => {
  assert.equal(validateAnonymousRefCode('DNR-019').valid, true);
  assert.equal(validateAnonymousRefCode('').valid, true);
  assert.equal(validateAnonymousRefCode('jemaat@gmail.com').valid, false);
  assert.equal(validateAnonymousRefCode('Budi Santoso').valid, false);
});

test('validateTransactionInput checks fiscal lock date, integer amount, and transfer accounts', () => {
  const lockedRes = validateTransactionInput(
    {
      type: 'expense',
      date: '2026-01-10',
      categoryId: 'cat-exp',
      description: 'Listrik Januari',
      amount: 350000,
      accountId: 'acc-1',
      paymentMethod: 'bank_transfer',
    },
    {
      churchId: 'church-a',
      ownerUid: 'owner-1',
      requireReceiptAboveAmount: 500000,
      allowOwnerSelfApproveOverride: true,
      autoLockOnApproval: true,
      defaultPaymentMethod: 'bank_transfer',
      fiscalLockBeforeDate: '2026-02-01',
      updatedBy: 'owner-1',
    },
  );
  assert.equal(lockedRes.valid, false);

  const sameTransfer = validateTransactionInput({
    type: 'transfer',
    date: '2026-04-12',
    description: 'Transfer Kas ke Bank',
    amount: 1000000,
    accountId: 'acc-1',
    toAccountId: 'acc-1',
    paymentMethod: 'bank_transfer',
  });
  assert.equal(sameTransfer.valid, false);
});

test('Workflow permissions and segregation of duties block non-owner self-approval', () => {
  const creatorApprover = makeMembership({
    uid: 'staff-1',
    role: 'finance_manager',
    financePermissions: ['finance.view', 'finance.approve', 'finance.reject'],
  });
  const otherApprover = makeMembership({
    uid: 'mgr-2',
    role: 'finance_manager',
    financePermissions: ['finance.view', 'finance.approve', 'finance.void'],
  });
  const owner = makeMembership({uid: 'staff-1', role: 'owner'});

  const submittedTx = makeTx({createdBy: 'staff-1', status: 'submitted'});
  const draftTx = makeTx({createdBy: 'staff-1', status: 'draft'});
  const approvedTx = makeTx({createdBy: 'staff-1', status: 'approved'});

  assert.equal(canApproveTransaction(creatorApprover, submittedTx).allowed, false);
  assert.equal(canApproveTransaction(otherApprover, submittedTx).allowed, true);
  assert.equal(canApproveTransaction(otherApprover, submittedTx).requiresOwnerOverride, false);

  const ownerSelfCheck = canApproveTransaction(owner, submittedTx, {
    churchId: 'church-a',
    ownerUid: 'owner-1',
    requireReceiptAboveAmount: 0,
    allowOwnerSelfApproveOverride: true,
    autoLockOnApproval: true,
    defaultPaymentMethod: 'cash',
    updatedBy: 'owner-1',
  });
  assert.equal(ownerSelfCheck.allowed, true);
  assert.equal(ownerSelfCheck.requiresOwnerOverride, true);

  assert.equal(canEditTransactionDraft(makeMembership({financePermissions: ['finance.editDraft']}), draftTx), true);
  assert.equal(canEditTransactionDraft(makeMembership({financePermissions: ['finance.editDraft']}), approvedTx), false);
  assert.equal(canSubmitTransaction(makeMembership({financePermissions: ['finance.submit']}), draftTx), true);
  assert.equal(canRejectTransaction(creatorApprover, submittedTx), true);
  assert.equal(canVoidTransaction(otherApprover, approvedTx), true);
});

test('Transactional approval and void deltas reverse exactly with integer precision', () => {
  const transferTx = makeTx({
    type: 'transfer',
    amount: 2000000,
    accountId: 'acc-cash',
    toAccountId: 'acc-bank',
  });

  const approveDeltas = computeApprovalBalanceDeltas(transferTx);
  assert.deepEqual(approveDeltas, [
    {accountId: 'acc-cash', delta: -2000000},
    {accountId: 'acc-bank', delta: 2000000},
  ]);

  const voidDeltas = computeVoidBalanceDeltas(transferTx);
  assert.deepEqual(voidDeltas, [
    {accountId: 'acc-cash', delta: 2000000},
    {accountId: 'acc-bank', delta: -2000000},
  ]);
});

test('Dashboard metrics, account ledger, period filters, and CSV export compute cleanly', () => {
  const accounts: FinanceAccount[] = [
    {
      id: 'acc-1',
      churchId: 'church-a',
      ownerUid: 'owner-1',
      name: 'Kas Utama',
      accountType: 'cash',
      currency: 'IDR',
      openingBalance: 1000000,
      currentBalance: 5500000,
      status: 'active',
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    },
  ];
  const categories: FinanceCategory[] = [
    {
      id: 'cat-1',
      churchId: 'church-a',
      ownerUid: 'owner-1',
      type: 'income',
      code: 'INC-1',
      name: 'Persembahan',
      color: '#0F766E',
      status: 'active',
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    },
    {
      id: 'cat-2',
      churchId: 'church-a',
      ownerUid: 'owner-1',
      type: 'expense',
      code: 'EXP-1',
      name: 'Listrik',
      color: '#BE123C',
      status: 'active',
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    },
  ];
  const txs: FinanceTransaction[] = [
    makeTx({id: 't1', txCode: 'TX-1', type: 'income', date: '2026-04-05', amount: 5000000, status: 'locked'}),
    makeTx({
      id: 't2',
      txCode: 'TX-2',
      type: 'expense',
      date: '2026-04-10',
      categoryId: 'cat-2',
      categoryName: 'Listrik',
      amount: 500000,
      status: 'approved',
    }),
    makeTx({id: 't3', txCode: 'TX-3', type: 'expense', date: '2026-04-12', amount: 900000, status: 'submitted'}),
    makeTx({id: 't4', txCode: 'TX-4', type: 'income', date: '2026-04-12', amount: 200000, status: 'voided'}),
  ];

  const range = resolveDateRange('month', '2026-04-15');
  assert.equal(range.startDate, '2026-04-01');
  assert.equal(range.endDate, '2026-04-15');

  const metrics = computeFinanceDashboardMetrics(accounts, txs, categories, range.startDate, range.endDate);
  assert.equal(metrics.totalBalance, 5500000);
  assert.equal(metrics.periodIncome, 5000000);
  assert.equal(metrics.periodExpense, 500000);
  assert.equal(metrics.netSurplus, 4500000);
  assert.equal(metrics.pendingCount, 1);
  assert.equal(metrics.voidedCount, 1);

  const scopedMetrics = computeFinanceDashboardMetrics(
    accounts,
    [
      ...txs,
      makeTx({id: 't5', txCode: 'TX-5', type: 'income', date: '2026-01-10', amount: 1000000, status: 'locked'}),
    ],
    categories,
    '2026-04-01',
    '2026-04-30',
    true,
  );
  assert.equal(scopedMetrics.monthlySeries.length, 1);
  assert.equal(scopedMetrics.monthlySeries[0].month, '2026-04');

  const ledger = computeAccountMutationLedger(accounts[0], txs);
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0].runningBalance, 5500000);

  const csv = buildFinanceCsvExport([makeTx({description: '=SUM(A1:A2)'})], 'IDR');
  assert.ok(csv.includes("'=SUM(A1:A2)"));
});
