import { describe, expect, it } from 'vitest';
import { allColumns, cell, csvCell, mergeConfig, resolveColumns } from './table';

const fields = [
  { key: 'nom', label: 'Nom', type: 'text', options: [] },
  { key: 'ville', label: 'Ville', type: 'single', options: [{ label: 'Ouagadougou', value: 'ouaga' }] },
  { key: 'cv', label: 'CV', type: 'file', options: [] },
];
const row = { reference: 'CAND-2026-000001', submittedAt: new Date('2026-10-01T10:00:00Z'), selectedAt: null, values: { nom: '=HYPERLINK("x")', ville: 'ouaga' } };

describe('table retenus', () => {
  it('exclut les fichiers et ajoute les colonnes statiques', () => {
    expect(allColumns(fields).map((c) => c.key)).toEqual(['reference', 'selectedAt', 'submittedAt', 'nom', 'ville']);
  });
  it('affiche le libellé des options', () => {
    const all = allColumns(fields);
    expect(cell(all.find((c) => c.key === 'ville')!, row, fields)).toBe('Ouagadougou');
  });
  it('neutralise les formules CSV', () => { expect(csvCell('=1+1')).toBe("'=1+1"); expect(csvCell('a,b')).toBe('"a,b"'); });
  it('fusionne la config : retire les champs supprimés, ajoute les nouveaux masqués', () => {
    const all = allColumns(fields);
    const m = mergeConfig(all, [{ key: 'ville', visible: true }, { key: 'ancien', visible: true }]);
    expect(m.map((c) => c.key)).toEqual(['ville', 'reference', 'selectedAt', 'submittedAt', 'nom']);
    expect(m.slice(1).every((c) => !c.visible)).toBe(true);
  });
  it('respecte l\'ordre demandé et ignore les clés inconnues', () => {
    const all = allColumns(fields);
    expect(resolveColumns(all, [], 'ville,x,reference').map((c) => c.key)).toEqual(['ville', 'reference']);
  });
});
