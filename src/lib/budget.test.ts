import { describe, expect, it } from 'vitest';
import { allocated, available, carried, copyPrevious, incomeIn, monthRows, moveMoney, readyToAssign, setAllocation, shiftMonth, spendingTrend, spent, validateMove, validateTxn, type Allocation, type Envelope, type Txn } from './budget';

const food: Envelope = { id: 'food', name: 'Groceries', group: 'Everyday', rollover: false };
const fun: Envelope = { id: 'fun', name: 'Fun', group: 'Fun', rollover: true };
const allocs: Allocation[] = [
  { month: '2026-10', envelopeId: 'food', amount: 400 },
  { month: '2026-10', envelopeId: 'fun', amount: 100 },
  { month: '2026-11', envelopeId: 'food', amount: 450 },
  { month: '2026-11', envelopeId: 'fun', amount: 100 },
];
const t = (p: Partial<Txn>): Txn => ({ id: Math.random().toString(), date: '2026-10-05', type: 'expense', envelopeId: 'food', payee: 'Shop', amount: 10, note: '', ...p });
const txns: Txn[] = [
  t({ type: 'income', envelopeId: null, amount: 2000, date: '2026-10-01' }),
  t({ type: 'income', envelopeId: null, amount: 2000, date: '2026-11-01' }),
  t({ amount: 420.5 }),
  t({ envelopeId: 'fun', amount: 60 }),
  t({ date: '2026-11-03', amount: 100 }),
  t({ date: '2026-11-04', envelopeId: 'fun', amount: 150 }),
];

describe('month maths', () => {
  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 2)).toBe('2027-01');
  });
  it('totals income, allocations and spending', () => {
    expect(incomeIn(txns, '2026-11')).toBe(2000);
    expect(allocated(allocs, '2026-11')).toBe(550);
    expect(spent(txns, '2026-10', 'food')).toBe(420.5);
  });
  it('does not roll over when rollover is off', () => {
    expect(available(food, allocs, txns, '2026-10')).toBe(-20.5);
    expect(available(food, allocs, txns, '2026-11')).toBe(350);
    expect(carried(food, allocs, txns, '2026-11')).toBe(0);
  });
  it('rolls money (and overspending) forward when on', () => {
    expect(available(fun, allocs, txns, '2026-10')).toBe(40);
    expect(carried(fun, allocs, txns, '2026-11')).toBe(40);
    expect(available(fun, allocs, txns, '2026-11')).toBe(-10);
  });
  it('accumulates ready-to-assign across months', () => {
    expect(readyToAssign(allocs, txns, '2026-10')).toBe(1500);
    expect(readyToAssign(allocs, txns, '2026-11')).toBe(2950);
  });
  it('builds rows for a month', () => {
    const [f, u] = monthRows([food, fun], allocs, txns, '2026-11');
    expect(f).toMatchObject({ allocated: 450, spent: 100, available: 350, carried: 0 });
    expect(u).toMatchObject({ allocated: 100, spent: 150, available: -10, carried: 40 });
  });
});

describe('editing allocations', () => {
  it('sets, clears and copies allocations', () => {
    let a = setAllocation(allocs, '2026-12', 'food', 300);
    expect(allocated(a, '2026-12', 'food')).toBe(300);
    a = setAllocation(a, '2026-12', 'food', 0);
    expect(a.some((x) => x.month === '2026-12')).toBe(false);
    const c = copyPrevious(setAllocation(allocs, '2026-12', 'fun', 5), '2026-12');
    expect(c.copied).toBe(1);
    expect(allocated(c.allocs, '2026-12', 'food')).toBe(450);
    expect(allocated(c.allocs, '2026-12', 'fun')).toBe(5);
  });
  it('moves money between envelopes', () => {
    const m = moveMoney(allocs, '2026-11', 'food', 'fun', 50);
    expect(allocated(m, '2026-11', 'food')).toBe(400);
    expect(allocated(m, '2026-11', 'fun')).toBe(150);
    expect(allocated(m, '2026-11')).toBe(550);
  });
  it('validates moves', () => {
    expect(validateMove('10', 'a', 'a', 50)).toMatch(/different/);
    expect(validateMove('0', 'a', 'b', 50)).toMatch(/greater than 0/);
    expect(validateMove('60', 'a', 'b', 50)).toMatch(/Only 50.00/);
    expect(validateMove('50', 'a', 'b', 50)).toBeNull();
  });
});

describe('transactions', () => {
  it('validates expenses and income differently', () => {
    expect(validateTxn({ date: '2026-11-01', type: 'expense', envelopeId: '', payee: '', amount: '-1' })).toEqual({ envelopeId: expect.any(String), payee: 'Who was paid?', amount: expect.any(String) });
    expect(validateTxn({ date: '2026-11-01', type: 'income', envelopeId: '', payee: '', amount: '5' })).toEqual({ payee: 'Where did the money come from?' });
  });
  it('summarises the spending trend', () => {
    const tr = spendingTrend(txns, '2026-11', 3);
    expect(tr).toEqual([{ month: '2026-09', spent: 0, income: 0 }, { month: '2026-10', spent: 480.5, income: 2000 }, { month: '2026-11', spent: 250, income: 2000 }]);
  });
});
