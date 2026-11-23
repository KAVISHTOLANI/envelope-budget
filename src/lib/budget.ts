import { addMonths, isValidISODate } from '../shared/dates';

export interface Envelope {
  id: string;
  name: string;
  group: string;
  /** Carry unspent (or overspent) money into the next month. */
  rollover: boolean;
  demo?: boolean;
}

/** Money assigned to an envelope for one month (YYYY-MM). */
export interface Allocation {
  month: string;
  envelopeId: string;
  amount: number;
}

export interface Txn {
  id: string;
  date: string;
  type: 'expense' | 'income';
  envelopeId: string | null;
  payee: string;
  amount: number; // always positive
  note: string;
  demo?: boolean;
}

export const GROUPS = ['Bills', 'Everyday', 'Goals', 'Fun'];
export const round = (n: number) => Math.round(n * 100) / 100;
export const monthOf = (date: string) => date.slice(0, 7);
export const shiftMonth = (ym: string, n: number) => addMonths(`${ym}-01`, n).slice(0, 7);

export function incomeIn(txns: Txn[], month: string) {
  return round(txns.filter((t) => t.type === 'income' && monthOf(t.date) === month).reduce((s, t) => s + t.amount, 0));
}

export function allocated(allocs: Allocation[], month: string, envelopeId?: string) {
  return round(allocs.filter((a) => a.month === month && (!envelopeId || a.envelopeId === envelopeId)).reduce((s, a) => s + a.amount, 0));
}

export function spent(txns: Txn[], month: string, envelopeId: string) {
  return round(txns.filter((t) => t.type === 'expense' && t.envelopeId === envelopeId && monthOf(t.date) === month).reduce((s, t) => s + t.amount, 0));
}

/** Earliest month with any data (so rollover can be computed from the start). */
export function firstMonth(allocs: Allocation[], txns: Txn[], fallback: string) {
  const all = [...allocs.map((a) => a.month), ...txns.map((t) => monthOf(t.date))];
  return all.length ? all.sort()[0] : fallback;
}

/** Money left in an envelope at the end of `month`, including rollover from earlier months when enabled. */
export function available(env: Envelope, allocs: Allocation[], txns: Txn[], month: string): number {
  if (!env.rollover) return round(allocated(allocs, month, env.id) - spent(txns, month, env.id));
  let bal = 0;
  for (let m = firstMonth(allocs, txns, month); m <= month; m = shiftMonth(m, 1)) bal = round(bal + allocated(allocs, m, env.id) - spent(txns, m, env.id));
  return bal;
}

/** Brought forward into `month` from the month before (0 when rollover is off). */
export function carried(env: Envelope, allocs: Allocation[], txns: Txn[], month: string) {
  return env.rollover ? available(env, allocs, txns, shiftMonth(month, -1)) : 0;
}

/** Income received up to and including `month`, minus everything assigned up to then. */
export function readyToAssign(allocs: Allocation[], txns: Txn[], month: string) {
  const inc = txns.filter((t) => t.type === 'income' && monthOf(t.date) <= month).reduce((s, t) => s + t.amount, 0);
  const asg = allocs.filter((a) => a.month <= month).reduce((s, a) => s + a.amount, 0);
  return round(inc - asg);
}

export function setAllocation(allocs: Allocation[], month: string, envelopeId: string, amount: number): Allocation[] {
  const rest = allocs.filter((a) => !(a.month === month && a.envelopeId === envelopeId));
  return amount === 0 ? rest : [...rest, { month, envelopeId, amount: round(amount) }];
}

/** Copies last month's allocations into `month` for envelopes that have none yet. */
export function copyPrevious(allocs: Allocation[], month: string): { allocs: Allocation[]; copied: number } {
  const prev = allocs.filter((a) => a.month === shiftMonth(month, -1));
  const have = new Set(allocs.filter((a) => a.month === month).map((a) => a.envelopeId));
  const add = prev.filter((a) => !have.has(a.envelopeId)).map((a) => ({ ...a, month }));
  return { allocs: [...allocs, ...add], copied: add.length };
}

export function moveMoney(allocs: Allocation[], month: string, from: string, to: string, amount: number): Allocation[] {
  return setAllocation(setAllocation(allocs, month, from, allocated(allocs, month, from) - amount), month, to, allocated(allocs, month, to) + amount);
}

export function validateMove(amountText: string, from: string, to: string, fromAvailable: number): string | null {
  const n = Number(amountText);
  if (!from || !to) return 'Choose both envelopes.';
  if (from === to) return 'Choose two different envelopes.';
  if (!amountText.trim() || !Number.isFinite(n) || n <= 0) return 'Enter an amount greater than 0.';
  if (n > fromAvailable + 1e-9) return `Only ${fromAvailable.toFixed(2)} is available to move.`;
  return null;
}

export function validateTxn(d: { date: string; type: Txn['type']; envelopeId: string; payee: string; amount: string }): Partial<Record<'date' | 'envelopeId' | 'payee' | 'amount', string>> {
  const e: Partial<Record<'date' | 'envelopeId' | 'payee' | 'amount', string>> = {};
  if (!isValidISODate(d.date)) e.date = 'Enter a date.';
  if (d.type === 'expense' && !d.envelopeId) e.envelopeId = 'Choose which envelope it comes from.';
  if (!d.payee.trim()) e.payee = d.type === 'income' ? 'Where did the money come from?' : 'Who was paid?';
  const n = Number(d.amount);
  if (!d.amount.trim() || !Number.isFinite(n) || n <= 0) e.amount = 'Enter an amount greater than 0.';
  else if (n > 1_000_000) e.amount = 'That amount looks too large.';
  return e;
}

/** Total spending per month for the `n` months ending at `month`. */
export function spendingTrend(txns: Txn[], month: string, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const m = shiftMonth(month, i - n + 1);
    return { month: m, spent: round(txns.filter((t) => t.type === 'expense' && monthOf(t.date) === m).reduce((s, t) => s + t.amount, 0)), income: incomeIn(txns, m) };
  });
}

export interface EnvelopeRow {
  env: Envelope;
  carried: number;
  allocated: number;
  spent: number;
  available: number;
}

export function monthRows(envs: Envelope[], allocs: Allocation[], txns: Txn[], month: string): EnvelopeRow[] {
  return envs.map((env) => ({ env, carried: carried(env, allocs, txns, month), allocated: allocated(allocs, month, env.id), spent: spent(txns, month, env.id), available: available(env, allocs, txns, month) }));
}
