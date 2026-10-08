export type FieldType = 'text' | 'longtext' | 'number' | 'single' | 'multi' | 'date' | 'yesno' | 'phone' | 'email' | 'file' | 'image';
export type Opt = { label: string; value: string };
export type Cond = { dependsOnKey: string; operator: 'eq' | 'neq' | 'in'; value: any };
export type Field = { key: string; type: FieldType; label: string; required: boolean; config?: Record<string, unknown>; options: Opt[]; conditions: Cond[] };
export type Section = { id: string; title: string; fields: Field[] };
export type Draft = { sections: Section[] };

export const TYPES: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Texte court' }, { type: 'longtext', label: 'Texte long' }, { type: 'number', label: 'Nombre' },
  { type: 'single', label: 'Choix unique' }, { type: 'multi', label: 'Choix multiple' }, { type: 'date', label: 'Date' },
  { type: 'yesno', label: 'Oui / Non' }, { type: 'phone', label: 'Téléphone' }, { type: 'email', label: 'Email' }, { type: 'file', label: 'Fichier' }, { type: 'image', label: 'Photo / image' },
];

export const newKey = (label: string, taken: Set<string>) => {
  const base = (label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'champ').replace(/^[0-9]/, 'c$&').slice(0, 30);
  let k = base, i = 2; while (taken.has(k)) k = `${base}_${i++}`; return k;
};
export const allKeys = (d: Draft) => new Set(d.sections.flatMap((s) => s.fields.map((f) => f.key)));

/** Visibilité conditionnelle (même règle que le backend). */
export const isVisible = (f: Field, a: Record<string, any>) => f.conditions.every((c) => {
  const v = a[c.dependsOnKey];
  return c.operator === 'eq' ? v === c.value : c.operator === 'neq' ? v !== c.value : Array.isArray(c.value) && c.value.includes(v);
});
