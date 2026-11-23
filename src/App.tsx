import { useMemo, useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, downloadText, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { DataTable, useTable, type Column } from './shared/table';
import { toCSV } from './shared/csv';
import { addDays, formatDay, fromISO, todayISO } from './shared/dates';
import {
  GROUPS,
  copyPrevious,
  monthOf,
  monthRows,
  moveMoney,
  readyToAssign,
  round,
  setAllocation,
  shiftMonth,
  spendingTrend,
  incomeIn,
  validateMove,
  validateTxn,
  type Allocation,
  type Envelope,
  type EnvelopeRow,
  type Txn,
} from './lib/budget';

const KEY = 'envelope:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/budget', label: 'Budget' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/reports', label: 'Reports' },
];

interface Store {
  envelopes: Envelope[];
  allocations: Allocation[];
  txns: Txn[];
}

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (ym: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) => fromISO(`${ym}-01`).toLocaleDateString(undefined, opts);

export function demoStore(today: string): Store {
  const m0 = monthOf(today);
  const e = (id: string, name: string, group: string, rollover = false): Envelope => ({ id: `demo-${id}`, name, group, rollover, demo: true });
  const envelopes: Envelope[] = [
    e('rent', 'Rent', 'Bills'), e('utilities', 'Electricity, gas and water', 'Bills'), e('phone', 'Phone and internet', 'Bills'),
    e('groceries', 'Groceries', 'Everyday'), e('transport', 'Transport', 'Everyday'), e('household', 'Household and toiletries', 'Everyday'),
    e('eating', 'Eating out', 'Fun'), e('hobbies', 'Hobbies', 'Fun', true),
    e('emergency', 'Emergency fund', 'Goals', true), e('holiday', 'Summer holiday', 'Goals', true),
  ];
  const plan: Record<string, number> = { rent: 1150, utilities: 140, phone: 65, groceries: 420, transport: 120, household: 60, eating: 120, hobbies: 60, emergency: 250, holiday: 180 };
  const allocations: Allocation[] = [];
  const txns: Txn[] = [];
  let n = 0;
  const tx = (date: string, type: Txn['type'], env: string | null, payee: string, amount: number, note = '') => txns.push({ id: `demo-t${n++}`, date, type, envelopeId: env && `demo-${env}`, payee, amount, note, demo: true });
  for (let k = 5; k >= 0; k--) {
    const m = shiftMonth(m0, -k);
    for (const [id, amt] of Object.entries(plan)) allocations.push({ month: m, envelopeId: `demo-${id}`, amount: amt });
    const d = (day: number) => `${m}-${String(day).padStart(2, '0')}`;
    const last = k === 0 ? Number(today.slice(8, 10)) : 28;
    const add = (day: number, type: Txn['type'], env: string | null, payee: string, amount: number, note = '') => day <= last && tx(d(day), type, env, payee, amount, note);
    add(1, 'income', null, 'Salary (demo employer)', 2600);
    if (k % 2 === 0) add(15, 'income', null, 'Freelance invoice', 180);
    add(1, 'expense', 'rent', 'Demo Lettings', 1150);
    add(4, 'expense', 'utilities', 'Demo Energy', 96 + k * 7);
    add(9, 'expense', 'phone', 'Demo Mobile', 65);
    for (const day of [3, 10, 17, 24]) add(day, 'expense', 'groceries', day % 2 ? 'Corner Market (demo)' : 'Demo Supermarket', 88 + ((day * (k + 3)) % 37));
    add(6, 'expense', 'transport', 'Monthly bus pass', 75);
    add(20, 'expense', 'transport', 'Train tickets', 28 + k * 4);
    add(12, 'expense', 'household', 'Demo Pharmacy', 34);
    add(8, 'expense', 'eating', 'Noodle bar', 42);
    add(19, 'expense', 'eating', 'Birthday dinner', k === 1 ? 118 : 56, k === 1 ? 'Went over this month' : '');
    if (k % 2 === 0) add(14, 'expense', 'hobbies', 'Climbing gym', 48);
    if (k === 3) add(22, 'expense', 'emergency', 'Car repair', 380, 'Clutch cable');
  }
  return { envelopes, allocations, txns };
}

export default function App() {
  const [route] = useRoute();
  const today = todayISO();
  const [store, setStore] = usePersistentState<Store>(KEY, () => demoStore(today));
  const ctx = { store, setStore, today };
  let page: ReactNode;
  if (route === '/') page = <Home />;
  else if (route === '/budget') page = <Budget {...ctx} />;
  else if (route === '/transactions') page = <Transactions {...ctx} />;
  else if (route === '/reports') page = <Reports {...ctx} />;
  else page = <NotFound />;
  return (
    <Shell name="Envelope" wordmark={['Enve', 'lope']} nav={NAV} route={route} cta={{ to: '/transactions', label: 'Add a transaction' }} footerNote="Envelope is an organisation tool, not financial advice. Figures are only as accurate as what you enter.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store) => void; today: string };

function EnvelopeCard({ row, i }: { row: EnvelopeRow; i: number }) {
  const total = row.allocated + row.carried;
  const pct = total > 0 ? Math.min(1, Math.max(0, row.spent / total)) : row.spent > 0 ? 1 : 0;
  const state = row.available < 0 ? 'over' : total > 0 && row.available / total < 0.15 ? 'low' : 'ok';
  return (
    <div className={`env-card is-${state}`} style={{ ['--i' as string]: i }}>
      <div className="row-between"><span className="env-name">{row.env.name}</span><span className="mono env-left">{money(row.available)}</span></div>
      <div className="env-bar" role="img" aria-label={`${row.env.name}: ${money(row.spent)} spent of ${money(total)}`}><span style={{ width: `${pct * 100}%` }} /></div>
      <span className="small muted">{money(row.spent)} of {money(total)} spent</span>
    </div>
  );
}

function HeroPreview() {
  const today = todayISO();
  const s = demoStore(today);
  const rows = monthRows(s.envelopes, s.allocations, s.txns, monthOf(today)).filter((r) => r.env.group !== 'Bills').slice(0, 6);
  return (
    <div className="hero-env">
      <div className="rta"><span className="small">Ready to assign · {monthName(monthOf(today), { month: 'long' })}</span><b>{money(readyToAssign(s.allocations, s.txns, monthOf(today)))}</b></div>
      <div className="env-grid">{rows.map((r, i) => <EnvelopeCard key={r.env.id} row={r} i={i} />)}</div>
    </div>
  );
}

function Home() {
  return (
    <Landing
      eyebrow="Envelope budgeting"
      title={<>Give every dollar <em>a job.</em></>}
      lead="Envelope budgeting splits each month’s income into named envelopes — rent, groceries, a holiday. Spend from an envelope and you can always see what’s left in it, without a bank login."
      primary={{ href: '#/budget', label: 'Open this month’s budget' }}
      secondary={{ href: '#/reports', label: 'See the reports' }}
      previewLabel="This month — demo budget"
      preview={<HeroPreview />}
      steps={[
        { title: 'Record income', body: 'Add what arrived this month. It appears as “ready to assign”.' },
        { title: 'Fill envelopes', body: 'Assign money to each envelope until ready to assign reaches zero. Copy last month’s plan in one click.' },
        { title: 'Spend and adjust', body: 'Log spending against an envelope. Overspent? Move money from another one.' },
      ]}
      stepsIntro="Envelope opens with six months of labelled, fictional demo data so every screen has something to show. Clear it whenever you like."
      features={[
        { title: 'Rollover where it matters', body: 'Savings goals and irregular costs can carry their balance into next month — including an overspend.' },
        { title: 'Move money', body: 'Shift money between envelopes for the month without touching what was spent.' },
        { title: 'Six-month view', body: 'Income vs spending per month and allocated vs spent per envelope, with labelled charts.' },
        { title: 'Your data', body: 'Everything stays in this browser. Export transactions as CSV whenever you like.' },
      ]}
      note="Envelope is a manual organisation tool, not financial advice. It doesn’t connect to banks."
      closing={{ title: <>Start with <em>this month’s</em> income.</>, action: { href: '#/transactions', label: 'Add income' } }}
    />
  );
}

/* ---------- Budget ---------- */
function Budget({ store, setStore, today }: Ctx) {
  const [month, setMonth] = useState(monthOf(today));
  const [flash, setFlash] = useFlash(5000);
  const [mv, setMv] = useState({ from: '', to: '', amount: '' });
  const [mvErr, setMvErr] = useState<string | null>(null);
  const [newEnv, setNewEnv] = useState({ name: '', group: 'Everyday', rollover: false });
  const [envErr, setEnvErr] = useState<string | null>(null);
  const rows = monthRows(store.envelopes, store.allocations, store.txns, month);
  const rta = readyToAssign(store.allocations, store.txns, month);
  const over = rows.filter((r) => r.available < 0);

  if (store.envelopes.length === 0 && store.txns.length === 0)
    return <EmptyState title="No envelopes yet" actions={<button type="button" className="btn btn-primary" onClick={() => setStore(demoStore(today))}>Load demo budget</button>}>Add your first envelope below, or explore with demo data. <AddEnvelope store={store} setStore={setStore} /></EmptyState>;

  function setAmt(envId: string, text: string) {
    const n = Number(text || 0);
    if (!Number.isFinite(n) || n < 0) return setFlash({ kind: 'error', text: 'Allocations must be 0 or more.' });
    setStore({ ...store, allocations: setAllocation(store.allocations, month, envId, round(n)) });
  }
  function doMove(e: React.FormEvent) {
    e.preventDefault();
    const fromRow = rows.find((r) => r.env.id === mv.from);
    const err = validateMove(mv.amount, mv.from, mv.to, Math.max(0, fromRow?.available ?? 0));
    setMvErr(err);
    if (err) return;
    setStore({ ...store, allocations: moveMoney(store.allocations, month, mv.from, mv.to, round(Number(mv.amount))) });
    setFlash({ kind: 'success', text: `Moved ${money(Number(mv.amount))} from ${fromRow!.env.name} to ${rows.find((r) => r.env.id === mv.to)!.env.name}.` });
    setMv({ from: '', to: '', amount: '' });
  }

  return (
    <div className="stack">
      <PageHead
        eyebrow="Budget"
        title={<>{monthName(month, { month: 'long' })} <em>{month.slice(0, 4)}</em></>}
        actions={<div className="row nowrap">
          <button type="button" className="btn btn-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <button type="button" className="btn btn-sm" disabled={month === monthOf(today)} onClick={() => setMonth(monthOf(today))}>This month</button>
          <button type="button" className="btn btn-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
        </div>}
      />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <div className={`rta-band ${rta < 0 ? 'is-neg' : rta === 0 ? 'is-zero' : ''}`} data-testid="rta">
        <div><span className="label-mono">Ready to assign</span><strong>{money(rta)}</strong></div>
        <p className="small">{rta > 0 ? 'Assign this to envelopes below until it reaches zero.' : rta === 0 ? 'Every dollar has a job.' : 'You’ve assigned more than you’ve received. Reduce an envelope.'}</p>
        <button type="button" className="btn btn-sm btn-light" onClick={() => { const r = copyPrevious(store.allocations, month); setStore({ ...store, allocations: r.allocs }); setFlash({ kind: r.copied ? 'success' : 'info', text: r.copied ? `Copied ${r.copied} allocation${r.copied === 1 ? '' : 's'} from ${monthName(shiftMonth(month, -1), { month: 'long' })}.` : 'Nothing to copy — every envelope already has an amount this month.' }); }}>Copy last month’s plan</button>
      </div>
      {over.length > 0 && <Notice kind="warn">{over.map((r) => r.env.name).join(', ')} {over.length === 1 ? 'is' : 'are'} overspent. Move money in from another envelope.</Notice>}
      <div className="card stack">
        <div className="table-wrap">
          <table className="table budget-table">
            <caption className="sr-only">Envelopes for {monthName(month)}</caption>
            <thead><tr><th scope="col">Envelope</th><th scope="col" className="num">Carried in</th><th scope="col" className="num">Assigned</th><th scope="col" className="num">Spent</th><th scope="col" className="num">Available</th></tr></thead>
            {GROUPS.concat([...new Set(store.envelopes.map((e) => e.group))].filter((g) => !GROUPS.includes(g))).map((g) => {
              const gr = rows.filter((r) => r.env.group === g);
              if (!gr.length) return null;
              return (
                <tbody key={g}>
                  <tr className="group-row"><th scope="rowgroup" colSpan={5}>{g} <span className="muted small">· {money(round(gr.reduce((s, r) => s + r.allocated, 0)))} assigned</span></th></tr>
                  {gr.map((r) => (
                    <tr key={r.env.id}>
                      <th scope="row">{r.env.name}{r.env.rollover && <span className="badge badge-accent roll">Rolls over</span>}{r.env.demo && <> <DemoTag /></>}</th>
                      <td className="num muted">{r.carried ? money(r.carried) : '—'}</td>
                      <td className="num"><input key={`${month}${r.allocated}`} className="amt" inputMode="decimal" defaultValue={r.allocated ? r.allocated.toFixed(2) : ''} placeholder="0.00" aria-label={`Assigned to ${r.env.name}`} onBlur={(e) => Number(e.target.value || 0) !== r.allocated && setAmt(r.env.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></td>
                      <td className="num">{money(r.spent)}</td>
                      <td className="num"><span className={`badge ${r.available < 0 ? 'badge-err' : r.available === 0 ? '' : 'badge-ok'}`}>{money(r.available)}</span></td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
      <div className="grid-2">
        <form className="card stack" onSubmit={doMove} noValidate aria-labelledby="mv-title">
          <h2 id="mv-title" className="h3">Move money</h2>
          <div className="form-grid two">
            <Field label="From">{(p) => <select {...p} value={mv.from} onChange={(e) => setMv({ ...mv, from: e.target.value })}><option value="">Choose…</option>{rows.filter((r) => r.available > 0).map((r) => <option key={r.env.id} value={r.env.id}>{r.env.name} ({money(r.available)})</option>)}</select>}</Field>
            <Field label="To">{(p) => <select {...p} value={mv.to} onChange={(e) => setMv({ ...mv, to: e.target.value })}><option value="">Choose…</option>{rows.map((r) => <option key={r.env.id} value={r.env.id}>{r.env.name}</option>)}</select>}</Field>
          </div>
          <Field label="Amount" error={mvErr}>{(p) => <input {...p} inputMode="decimal" value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} placeholder="0.00" />}</Field>
          <div><button className="btn btn-primary" type="submit">Move</button></div>
        </form>
        <div className="card stack">
          <h2 className="h3">Add an envelope</h2>
          <AddEnvelope store={store} setStore={setStore} onAdded={(n) => setFlash({ kind: 'success', text: `Added “${n}”. Give it an amount above.` })} value={newEnv} setValue={setNewEnv} err={envErr} setErr={setEnvErr} />
          {store.envelopes.some((e) => e.demo) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const ids = new Set(store.envelopes.filter((e) => e.demo).map((e) => e.id)); setStore({ envelopes: store.envelopes.filter((e) => !e.demo), allocations: store.allocations.filter((a) => !ids.has(a.envelopeId)), txns: store.txns.filter((t) => !t.demo) }); setFlash({ kind: 'success', text: 'Demo budget cleared.' }); }}>Clear demo budget</button>}
        </div>
      </div>
    </div>
  );
}

function AddEnvelope({ store, setStore, onAdded, value, setValue, err, setErr }: { store: Store; setStore: (s: Store) => void; onAdded?: (name: string) => void; value?: { name: string; group: string; rollover: boolean }; setValue?: (v: { name: string; group: string; rollover: boolean }) => void; err?: string | null; setErr?: (e: string | null) => void }) {
  const [local, setLocal] = useState({ name: '', group: 'Everyday', rollover: false });
  const [localErr, setLocalErr] = useState<string | null>(null);
  const v = value ?? local, setV = setValue ?? setLocal, e = err === undefined ? localErr : err, setE = setErr ?? setLocalErr;
  function add(ev: React.FormEvent) {
    ev.preventDefault();
    const name = v.name.trim();
    if (!name) return setE('Name the envelope.');
    if (store.envelopes.some((x) => x.name.toLowerCase() === name.toLowerCase())) return setE('An envelope with that name already exists.');
    setE(null);
    setStore({ ...store, envelopes: [...store.envelopes, { id: uid('env'), name, group: v.group, rollover: v.rollover }] });
    setV({ name: '', group: v.group, rollover: false });
    onAdded?.(name);
  }
  return (
    <form className="stack" onSubmit={add} noValidate>
      <div className="form-grid two">
        <Field label="Envelope name" error={e}>{(p) => <input {...p} value={v.name} onChange={(x) => setV({ ...v, name: x.target.value })} maxLength={50} />}</Field>
        <Field label="Group">{(p) => <select {...p} value={v.group} onChange={(x) => setV({ ...v, group: x.target.value })}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>}</Field>
      </div>
      <label className="check"><input type="checkbox" checked={v.rollover} onChange={(x) => setV({ ...v, rollover: x.target.checked })} /> Carry the balance into next month</label>
      <div><button className="btn" type="submit">Add envelope</button></div>
    </form>
  );
}

/* ---------- Transactions ---------- */
type Row = Txn & { envName: string };
function Transactions({ store, setStore, today }: Ctx) {
  const [flash, setFlash] = useFlash();
  const [d, setD] = useState({ date: today, type: 'expense' as Txn['type'], envelopeId: '', payee: '', amount: '', note: '' });
  const [submitted, setSubmitted] = useState(false);
  const [q, setQ] = useState('');
  const [env, setEnv] = useState('');
  const [month, setMonth] = useState(monthOf(today));
  const months = [...new Set([monthOf(today), ...store.txns.map((t) => monthOf(t.date))])].sort().reverse();
  const errors = submitted ? validateTxn(d) : {};
  const rows: Row[] = useMemo(() => store.txns.filter((t) => (!month || monthOf(t.date) === month) && (!env || (env === 'income' ? t.type === 'income' : t.envelopeId === env))).map((t) => ({ ...t, envName: t.type === 'income' ? 'Income' : store.envelopes.find((e) => e.id === t.envelopeId)?.name ?? 'Deleted envelope' })).filter((t) => `${t.payee} ${t.note} ${t.envName}`.toLowerCase().includes(q.trim().toLowerCase())), [store, q, env, month]);
  const columns: Column<Row>[] = [
    { key: 'date', label: 'Date', sort: (r) => r.date, render: (r) => formatDay(r.date, { day: 'numeric', month: 'short' }) },
    { key: 'payee', label: 'Payee', sort: (r) => r.payee, render: (r) => <>{r.payee}{r.note && <div className="small muted">{r.note}</div>}</> },
    { key: 'env', label: 'Envelope', sort: (r) => r.envName, render: (r) => r.envName },
    { key: 'amt', label: 'Amount', num: true, sort: (r) => (r.type === 'income' ? r.amount : -r.amount), render: (r) => <span className={r.type === 'income' ? 'pos' : ''}>{r.type === 'income' ? '+' : '−'}{money(r.amount)}</span> },
    { key: 'x', label: 'Actions', render: (r) => <button type="button" className="btn btn-sm btn-ghost" aria-label={`Delete ${r.payee} ${money(r.amount)}`} onClick={() => setStore({ ...store, txns: store.txns.filter((t) => t.id !== r.id) })}>Delete</button> },
  ];
  const table = useTable(rows, columns, { initialSort: 'date', initialDir: 'desc', pageSize: 12 });
  function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateTxn(d)).length) return;
    setStore({ ...store, txns: [...store.txns, { id: uid('txn'), date: d.date, type: d.type, envelopeId: d.type === 'income' ? null : d.envelopeId, payee: d.payee.trim(), amount: round(Number(d.amount)), note: d.note.trim() }] });
    setFlash({ kind: 'success', text: `${d.type === 'income' ? 'Income' : 'Expense'} of ${money(Number(d.amount))} saved.` });
    setD({ ...d, payee: '', amount: '', note: '' });
    setSubmitted(false);
  }
  return (
    <div className="stack">
      <PageHead eyebrow="Transactions" title={<>Money in, <em>money out.</em></>} actions={<button type="button" className="btn" disabled={!rows.length} onClick={() => downloadText(`envelope-${month || 'all'}.csv`, toCSV(['Date', 'Type', 'Envelope', 'Payee', 'Amount', 'Note'], rows.map((r) => [r.date, r.type, r.envName, r.payee, r.amount.toFixed(2), r.note])), 'text/csv')}>Export CSV</button>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {store.envelopes.length === 0 && <Notice kind="info">Add an envelope on the Budget page before logging spending. Income can be added now.</Notice>}
      <form className="card stack" onSubmit={save} noValidate aria-labelledby="add-title">
        <h2 id="add-title" className="h3">Add a transaction</h2>
        <div className="tabs" role="radiogroup" aria-label="Type">
          {(['expense', 'income'] as const).map((t) => <button key={t} type="button" role="radio" aria-checked={d.type === t} onClick={() => setD({ ...d, type: t })}>{t === 'expense' ? 'Spending' : 'Income'}</button>)}
        </div>
        <div className="form-grid">
          <Field label="Date" error={errors.date}>{(p) => <input {...p} type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />}</Field>
          <Field label={d.type === 'income' ? 'From' : 'Payee'} error={errors.payee}>{(p) => <input {...p} value={d.payee} onChange={(e) => setD({ ...d, payee: e.target.value })} />}</Field>
          <Field label="Amount" error={errors.amount}>{(p) => <input {...p} inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} placeholder="0.00" />}</Field>
          {d.type === 'expense' && <Field label="Envelope" error={errors.envelopeId}>{(p) => <select {...p} value={d.envelopeId} onChange={(e) => setD({ ...d, envelopeId: e.target.value })}><option value="">Choose…</option>{store.envelopes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>}
          <Field label="Note" hint="Optional">{(p) => <input {...p} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />}</Field>
        </div>
        <div><button className="btn btn-primary" type="submit">Save transaction</button></div>
      </form>
      <div className="card stack">
        <div className="filters">
          <Field label="Search" className="grow">{(p) => <input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Payee or note" />}</Field>
          <Field label="Month">{(p) => <select {...p} value={month} onChange={(e) => setMonth(e.target.value)}><option value="">All months</option>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>}</Field>
          <Field label="Show envelope">{(p) => <select {...p} value={env} onChange={(e) => setEnv(e.target.value)}><option value="">All</option><option value="income">Income only</option>{store.envelopes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
        </div>
        <DataTable caption="Transactions" columns={columns} table={table} rowKey={(r) => r.id} empty="No transactions match these filters." />
      </div>
    </div>
  );
}

/* ---------- Reports ---------- */
function Reports({ store, today }: Ctx) {
  const month = monthOf(today);
  const trend = spendingTrend(store.txns, month, 6);
  const max = Math.max(100, ...trend.map((t) => Math.max(t.spent, t.income)));
  const nice = Math.ceil(max / 500) * 500;
  const rows = monthRows(store.envelopes, store.allocations, store.txns, month).filter((r) => r.allocated || r.spent);
  const envMax = Math.max(1, ...rows.map((r) => Math.max(r.allocated + Math.max(0, r.carried), r.spent)));
  const [tip, setTip] = useState<string | null>(null);
  if (!store.txns.length) return <EmptyState title="No transactions yet" actions={<a className="btn btn-primary" href="#/transactions">Add a transaction</a>}>Reports appear once you log income and spending.</EmptyState>;
  const sixSpent = round(trend.reduce((s, t) => s + t.spent, 0)), sixIn = round(trend.reduce((s, t) => s + t.income, 0));
  return (
    <div className="stack">
      <PageHead eyebrow="Reports" title={<>Six months <em>at a glance.</em></>} description={`${monthName(trend[0].month, { month: 'short', year: 'numeric' })} – ${monthName(month, { month: 'short', year: 'numeric' })}`} />
      <div className="stats">
        <div className="stat"><span className="stat-label">Income, 6 months</span><span className="stat-value">{money(sixIn)}</span></div>
        <div className="stat"><span className="stat-label">Spent, 6 months</span><span className="stat-value">{money(sixSpent)}</span></div>
        <div className="stat"><span className="stat-label">Difference</span><span className="stat-value">{money(round(sixIn - sixSpent))}</span></div>
        <div className="stat"><span className="stat-label">Income this month</span><span className="stat-value">{money(incomeIn(store.txns, month))}</span></div>
      </div>
      <section className="card stack" aria-labelledby="trend-title">
        <h2 id="trend-title" className="h3">Income and spending per month</h2>
        <div className="bars-wrap" onMouseLeave={() => setTip(null)}>
          <div className="bars-axis" aria-hidden="true">{[nice, nice / 2, 0].map((t) => <span key={t}>${t.toLocaleString()}</span>)}</div>
          <div className="bars pairs" role="img" aria-label={trend.map((t) => `${monthName(t.month, { month: 'short' })}: income ${money(t.income)}, spent ${money(t.spent)}`).join('; ')}>
            {trend.map((t, i) => {
              const text = `${monthName(t.month)} — income ${money(t.income)}, spent ${money(t.spent)}`;
              return (
                <div key={t.month} className="bar-col" style={{ ['--i' as string]: i }} tabIndex={0} aria-label={text} onMouseEnter={() => setTip(text)} onFocus={() => setTip(text)} onBlur={() => setTip(null)}>
                  <div className="pair">
                    <div className="bar-stack" style={{ height: `${(t.income / nice) * 100}%` }}><span style={{ flexGrow: 1, background: 'var(--income)' }} /></div>
                    <div className="bar-stack" style={{ height: `${(t.spent / nice) * 100}%` }}><span style={{ flexGrow: 1, background: 'var(--accent)' }} /></div>
                  </div>
                  <span className="bar-label mono">{monthName(t.month, { month: 'short' })}</span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="small" aria-live="polite">{tip ?? 'Hover or focus a month for exact figures.'}</p>
        <p className="legend"><span><i style={{ background: 'var(--income)' }} />Income</span><span><i style={{ background: 'var(--accent)' }} />Spending</span><span className="muted">· USD per month</span></p>
      </section>
      <section className="card stack" aria-labelledby="env-title">
        <h2 id="env-title" className="h3">Assigned vs spent — {monthName(month, { month: 'long' })}</h2>
        <ul className="vs-list">
          {rows.map((r, i) => {
            const budget = r.allocated + Math.max(0, r.carried);
            return (
              <li key={r.env.id} style={{ ['--i' as string]: i }}>
                <span className="vs-name">{r.env.name}</span>
                <span className="vs-track" role="img" aria-label={`${r.env.name}: spent ${money(r.spent)} of ${money(budget)}`}>
                  <span className="vs-budget" style={{ width: `${(budget / envMax) * 100}%` }} />
                  <span className={`vs-spent ${r.spent > budget ? 'is-over' : ''}`} style={{ width: `${(r.spent / envMax) * 100}%` }} />
                </span>
                <span className="mono small">{money(r.spent)} / {money(budget)}</span>
              </li>
            );
          })}
        </ul>
        <p className="legend"><span><i className="key-budget" />Assigned (incl. carried in)</span><span><i style={{ background: 'var(--accent)' }} />Spent</span><span><i style={{ background: 'var(--err)' }} />Over budget</span></p>
      </section>
      <p className="small muted">Last transaction: {formatDay(store.txns.map((t) => t.date).sort().at(-1)!)} · data through {formatDay(addDays(today, 0))}.</p>
    </div>
  );
}
