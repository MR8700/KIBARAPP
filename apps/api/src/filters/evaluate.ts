import { z } from 'zod';

/** Filter → Group → (Condition | Group). Opérateurs selon le type du champ. */
export const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is', 'is_not', 'in', 'not_in', 'contains', 'is_empty', 'not_empty'] as const;
export type Op = (typeof OPS)[number];
export type Condition = { field: string; operator: Op; value?: unknown };
export type Group = { op: 'AND' | 'OR'; not?: boolean; children: (Group | Condition)[] };

const condition: z.ZodType<Condition> = z.object({ field: z.string().max(60), operator: z.enum(OPS), value: z.unknown().optional() });
export const groupSchema: z.ZodType<Group> = z.lazy(() =>
  z.object({ op: z.enum(['AND', 'OR']), not: z.boolean().optional(), children: z.array(z.union([groupSchema, condition])).max(50) }));

/** Garde-fous : profondeur ≤ 5 et ≤ 50 conditions au total. */
export function checkLimits(g: Group): void {
  let n = 0;
  const walk = (x: Group, d: number) => {
    if (d > 5) throw new Error('Filtre trop profond');
    for (const c of x.children) { if ('children' in c) walk(c, d + 1); else if (++n > 50) throw new Error('Trop de conditions'); }
  };
  walk(g, 1);
}

export type FieldMeta = { type: string };
export type Getter = (key: string) => unknown;

const NUMERIC = new Set(['number', 'rating', 'year']);
const num = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const time = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? new Date(v as any).getTime() : NaN);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const empty = (v: unknown) => arr(v).length === 0;

function compare(type: string, a: unknown, b: unknown): number {
  if (NUMERIC.has(type)) return num(a) - num(b);
  if (type === 'date' || type === 'datetime') return time(a) - time(b);
  return String(a).localeCompare(String(b));
}

export function evalCondition(c: Condition, type: string, raw: unknown): boolean {
  const v = c.value;
  switch (c.operator) {
    case 'is_empty': return empty(raw);
    case 'not_empty': return !empty(raw);
    case 'is': case 'eq': return !empty(raw) && (Array.isArray(raw) ? raw.map(String).includes(String(v)) : NUMERIC.has(type) || type.startsWith('date') ? compare(type, raw, v) === 0 : String(raw).toLowerCase() === String(v).toLowerCase());
    case 'is_not': case 'neq': return empty(raw) || !(Array.isArray(raw) ? raw.map(String).includes(String(v)) : NUMERIC.has(type) || type.startsWith('date') ? compare(type, raw, v) === 0 : String(raw).toLowerCase() === String(v).toLowerCase());
    case 'in': return arr(v).some((x) => arr(raw).map(String).includes(String(x)));
    case 'not_in': return !arr(v).some((x) => arr(raw).map(String).includes(String(x)));
    case 'contains': return !empty(raw) && String(Array.isArray(raw) ? raw.join(' ') : raw).toLowerCase().includes(String(v ?? '').toLowerCase());
    case 'gt': case 'gte': case 'lt': case 'lte': {
      if (empty(raw)) return false; const d = compare(type, raw, v); if (Number.isNaN(d)) return false;
      return c.operator === 'gt' ? d > 0 : c.operator === 'gte' ? d >= 0 : c.operator === 'lt' ? d < 0 : d <= 0;
    }
    case 'between': {
      const [lo, hi] = arr(v); if (empty(raw) || lo === undefined || hi === undefined) return false;
      const a = compare(type, raw, lo), b = compare(type, raw, hi); return !Number.isNaN(a) && !Number.isNaN(b) && a >= 0 && b <= 0;
    }
  }
}

/** Un groupe sans condition accepte tout (filtre vide). NOT inverse le résultat du groupe. */
export function evalGroup(g: Group, meta: Record<string, FieldMeta>, get: Getter): boolean {
  if (!g.children.length) return true;
  const results = g.children.map((c) => ('children' in c ? evalGroup(c, meta, get) : evalCondition(c, meta[c.field]?.type ?? 'text', get(c.field))));
  const r = g.op === 'AND' ? results.every(Boolean) : results.some(Boolean);
  return g.not ? !r : r;
}
