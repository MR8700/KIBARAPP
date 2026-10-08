/** Tableau « Retenus » : une seule source de vérité pour l'écran, le CSV, l'Excel et le PDF. */
export type Col = { key: string; label: string; kind: 'text' | 'date' };
export type FieldRow = { key: string; label: string; type: string; options: { label: string; value: string }[] };
export type AppRow = { reference: string; submittedAt: Date; selectedAt: Date | null; values: Record<string, unknown> };

export const STATIC_COLS: Col[] = [
  { key: 'reference', label: 'Référence', kind: 'text' },
  { key: 'selectedAt', label: 'Date de sélection', kind: 'date' },
  { key: 'submittedAt', label: 'Date de candidature', kind: 'date' },
];
const isFile = (t: string) => t === 'file' || t === 'image';

/** Toutes les colonnes possibles : statiques + un champ du formulaire = une colonne (fichiers exclus). */
export const allColumns = (fields: FieldRow[]): Col[] => [
  ...STATIC_COLS,
  ...fields.filter((f) => !isFile(f.type)).map((f): Col => ({ key: f.key, label: f.label, kind: 'text' })),
];

/** Configuration par défaut : référence + 4 premiers champs + date de sélection. */
export function defaultConfig(all: Col[]): { key: string; visible: boolean }[] {
  const shown = new Set(['reference', 'selectedAt', ...all.filter((c) => !STATIC_COLS.some((s) => s.key === c.key)).slice(0, 4).map((c) => c.key)]);
  return all.map((c) => ({ key: c.key, visible: shown.has(c.key) }));
}

/** Fusionne la config enregistrée avec les colonnes actuelles (champs ajoutés/supprimés depuis). */
export function mergeConfig(all: Col[], saved: { key: string; visible: boolean }[] | null) {
  if (!saved?.length) return defaultConfig(all);
  const known = new Set(all.map((c) => c.key));
  const kept = saved.filter((c) => known.has(c.key));
  const have = new Set(kept.map((c) => c.key));
  return [...kept, ...all.filter((c) => !have.has(c.key)).map((c) => ({ key: c.key, visible: false }))];
}

const TZ = (() => { try { new Intl.DateTimeFormat('fr-FR', { timeZone: process.env.EXPORT_TZ || 'UTC' }); return process.env.EXPORT_TZ || 'UTC'; } catch { return 'UTC'; } })();
const dtf = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
export const fmtDate = (d: Date | null) => (d ? dtf.format(d) : '');

const plain = (v: unknown): string =>
  Array.isArray(v) ? v.map(plain).join(', ') : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

export function dateOf(c: Col, r: AppRow): Date | null { return c.key === 'selectedAt' ? r.selectedAt : c.key === 'submittedAt' ? r.submittedAt : null; }

export function cell(c: Col, r: AppRow, fields: FieldRow[]): string {
  if (c.key === 'reference') return r.reference;
  if (c.kind === 'date') return fmtDate(dateOf(c, r));
  const f = fields.find((x) => x.key === c.key);
  const lab = (x: unknown) => f?.options.find((o) => o.value === x)?.label ?? x;
  const v = r.values[c.key];
  return plain(Array.isArray(v) ? v.map(lab) : lab(v));
}

/** Neutralise l'injection de formules (CSV ouvert dans Excel) et échappe les séparateurs. */
export const csvCell = (v: unknown) => {
  let t = Array.isArray(v) ? v.join(' | ') : v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",;\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};

/** Colonnes demandées (query) ∩ colonnes connues, dans l'ordre demandé ; sinon config enregistrée. */
export function resolveColumns(all: Col[], config: { key: string; visible: boolean }[], asked?: string): Col[] {
  const byKey = new Map(all.map((c) => [c.key, c]));
  const keys = asked ? [...new Set(asked.split(','))] : config.filter((c) => c.visible).map((c) => c.key);
  return keys.map((k) => byKey.get(k)).filter((c): c is Col => !!c);
}
