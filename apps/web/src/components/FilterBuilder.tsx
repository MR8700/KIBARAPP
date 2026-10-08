'use client';
import { useState } from 'react';

export type FieldDef = { key: string; label: string; type: string; options: { label: string; value: string }[] };
export type Cond = { field: string; operator: string; value?: any };
export type Group = { op: 'AND' | 'OR'; not?: boolean; children: (Group | Cond)[] };
export const emptyGroup = (): Group => ({ op: 'AND', children: [] });
export const countConds = (g: Group): number => g.children.reduce((n, c) => n + ('children' in c ? countConds(c) : 1), 0);

const L: Record<string, string> = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', between: 'entre', is: 'est', is_not: "n'est pas", in: 'dans', not_in: "n'est pas dans", contains: 'contient', is_empty: 'est vide', not_empty: "n'est pas vide" };
const opsFor = (t: string) =>
  ['number', 'rating', 'year', 'date', 'datetime'].includes(t) ? ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'not_empty']
  : ['single', 'yesno'].includes(t) ? ['is', 'is_not', 'in', 'not_in']
  : t === 'multi' ? ['in', 'not_in', 'is_empty']
  : ['contains', 'eq', 'neq', 'is_empty', 'not_empty'];
const choices = (f: FieldDef) => (f.type === 'yesno' ? [{ label: 'Oui', value: 'oui' }, { label: 'Non', value: 'non' }] : f.options);
const inputType = (t: string) => (t === 'date' ? 'date' : ['number', 'rating', 'year'].includes(t) ? 'number' : 'text');
const cls = 'min-w-0 rounded-lg border border-line bg-white px-2.5 py-2 text-sm';

function CondRow({ c, fields, onChange, onDelete }: { c: Cond; fields: FieldDef[]; onChange: (c: Cond) => void; onDelete: () => void }) {
  const f = fields.find((x) => x.key === c.field) ?? fields[0];
  const ops = opsFor(f.type); const op = ops.includes(c.operator) ? c.operator : ops[0];
  const multi = op === 'in' || op === 'not_in'; const opts = choices(f);
  const set = (p: Partial<Cond>) => onChange({ ...c, field: f.key, operator: op, ...p });
  const one = (v: any, on: (x: any) => void) => opts.length ? (
    <select className={cls} value={v ?? ''} onChange={(e) => on(e.target.value)}><option value="">…</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  ) : <input className={`${cls} w-full`} type={inputType(f.type)} value={v ?? ''} onChange={(e) => on(e.target.value)} />;
  return (<div className="space-y-2 rounded-xl bg-subtle p-2.5">
    <div className="flex gap-2">
      <select className={`${cls} flex-1`} value={f.key} onChange={(e) => { const nf = fields.find((x) => x.key === e.target.value)!; onChange({ field: nf.key, operator: opsFor(nf.type)[0] }); }}>
        {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
      <button aria-label="Supprimer" className="shrink-0 px-1 text-muted" onClick={onDelete}>✕</button></div>
    <div className="flex flex-wrap gap-2">
      <select className={cls} value={op} onChange={(e) => set({ operator: e.target.value, value: undefined })}>{ops.map((o) => <option key={o} value={o}>{L[o]}</option>)}</select>
      {op === 'is_empty' || op === 'not_empty' ? null : op === 'between' ? (<>
        <input className={`${cls} w-24`} type={inputType(f.type)} value={c.value?.[0] ?? ''} onChange={(e) => set({ value: [e.target.value, c.value?.[1] ?? ''] })} />
        <span className="self-center text-xs text-muted">et</span>
        <input className={`${cls} w-24`} type={inputType(f.type)} value={c.value?.[1] ?? ''} onChange={(e) => set({ value: [c.value?.[0] ?? '', e.target.value] })} /></>)
      : multi ? (<div className="flex flex-wrap gap-1.5">{opts.map((o) => { const a: string[] = c.value ?? []; const on = a.includes(o.value);
          return <button key={o.value} type="button" onClick={() => set({ value: on ? a.filter((x) => x !== o.value) : [...a, o.value] })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-primary bg-primary text-white' : 'border-line bg-white'}`}>{o.label}</button>; })}</div>)
      : one(c.value, (v) => set({ value: v }))}</div></div>);
}

export default function GroupEditor({ g, fields, onChange, onDelete, depth = 0 }: { g: Group; fields: FieldDef[]; onChange: (g: Group) => void; onDelete?: () => void; depth?: number }) {
  const upd = (i: number, c: Group | Cond) => onChange({ ...g, children: g.children.map((x, j) => (j === i ? c : x)) });
  const del = (i: number) => onChange({ ...g, children: g.children.filter((_, j) => j !== i) });
  const [open] = useState(true);
  if (!fields.length) return null;
  return (<div className={`space-y-2 ${depth ? 'rounded-xl border-l-4 border-primary/30 bg-white p-2.5' : ''}`}>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="flex overflow-hidden rounded-lg border border-line">{(['AND', 'OR'] as const).map((o) => <button key={o} type="button" onClick={() => onChange({ ...g, op: o })}
        className={`px-3 py-1.5 font-semibold ${g.op === o ? 'bg-primary text-white' : 'bg-white'}`}>{o === 'AND' ? 'ET' : 'OU'}</button>)}</div>
      <label className="flex items-center gap-1.5 font-medium"><input type="checkbox" checked={!!g.not} onChange={(e) => onChange({ ...g, not: e.target.checked })} />NON</label>
      {onDelete && <button className="ml-auto text-muted" onClick={onDelete}>Retirer le groupe</button>}</div>
    {open && g.children.map((c, i) => 'children' in c
      ? <GroupEditor key={i} g={c} fields={fields} depth={depth + 1} onChange={(x) => upd(i, x)} onDelete={() => del(i)} />
      : <CondRow key={i} c={c} fields={fields} onChange={(x) => upd(i, x)} onDelete={() => del(i)} />)}
    <div className="flex gap-2 text-xs font-semibold text-primary">
      <button onClick={() => onChange({ ...g, children: [...g.children, { field: fields[0].key, operator: opsFor(fields[0].type)[0] }] })}>+ Condition</button>
      {depth < 3 && <button onClick={() => onChange({ ...g, children: [...g.children, emptyGroup()] })}>+ Groupe</button>}</div></div>);
}
