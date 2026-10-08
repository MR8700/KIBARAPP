import { describe, expect, it } from 'vitest';
import { checkLimits, evalGroup, Group } from './evaluate';

const meta = { sexe: { type: 'single' }, age: { type: 'number' }, niveau: { type: 'single' }, langues: { type: 'multi' }, naissance: { type: 'date' }, nom: { type: 'text' } };
const run = (g: Group, row: Record<string, unknown>) => evalGroup(g, meta, (k) => row[k]);

// Sexe = Femme ET Âge entre 20 et 30 ET (Niveau = BAC+3 OU Niveau = BAC+5)  — l'exemple du cahier des charges
const spec: Group = { op: 'AND', children: [
  { field: 'sexe', operator: 'is', value: 'femme' },
  { field: 'age', operator: 'between', value: [20, 30] },
  { op: 'OR', children: [{ field: 'niveau', operator: 'is', value: 'bac3' }, { field: 'niveau', operator: 'is', value: 'bac5' }] },
] };

describe('moteur de filtres', () => {
  it('exemple du cahier des charges', () => {
    expect(run(spec, { sexe: 'femme', age: '25', niveau: 'bac5' })).toBe(true);
    expect(run(spec, { sexe: 'femme', age: '31', niveau: 'bac5' })).toBe(false);
    expect(run(spec, { sexe: 'homme', age: '25', niveau: 'bac3' })).toBe(false);
    expect(run(spec, { sexe: 'femme', age: '25', niveau: 'bac2' })).toBe(false);
  });
  it('compare les nombres comme des nombres (pas du texte)', () => {
    expect(run({ op: 'AND', children: [{ field: 'age', operator: 'gt', value: 9 }] }, { age: '10' })).toBe(true);
  });
  it('NOT inverse un groupe', () => {
    expect(run({ op: 'AND', not: true, children: [{ field: 'sexe', operator: 'is', value: 'femme' }] }, { sexe: 'homme' })).toBe(true);
  });
  it('choix multiple : in / not_in', () => {
    const row = { langues: ['fr', 'en'] };
    expect(run({ op: 'AND', children: [{ field: 'langues', operator: 'in', value: ['en', 'de'] }] }, row)).toBe(true);
    expect(run({ op: 'AND', children: [{ field: 'langues', operator: 'not_in', value: ['en'] }] }, row)).toBe(false);
  });
  it('dates et valeurs vides', () => {
    expect(run({ op: 'AND', children: [{ field: 'naissance', operator: 'lt', value: '2000-01-01' }] }, { naissance: '1995-06-01' })).toBe(true);
    expect(run({ op: 'AND', children: [{ field: 'age', operator: 'gte', value: 18 }] }, {})).toBe(false);
    expect(run({ op: 'AND', children: [{ field: 'nom', operator: 'is_empty' }] }, {})).toBe(true);
  });
  it('filtre vide = tout passe ; limites de profondeur', () => {
    expect(run({ op: 'AND', children: [] }, {})).toBe(true);
    let g: Group = { op: 'AND', children: [] }; for (let i = 0; i < 6; i++) g = { op: 'AND', children: [g] };
    expect(() => checkLimits(g)).toThrow();
  });
});
