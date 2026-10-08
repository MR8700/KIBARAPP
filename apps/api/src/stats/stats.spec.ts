import { describe, expect, it } from 'vitest';
import { bucketByDay, distribution } from './stats';

describe('stats', () => {
  it('regroupe par jour UTC sur une fenêtre fixe', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    const r = bucketByDay([new Date('2026-10-08T01:00:00Z'), new Date('2026-10-08T23:59:00Z'), new Date('2026-10-06T10:00:00Z'), new Date('2026-08-01T10:00:00Z')], 3, now);
    expect(r).toEqual([{ day: '2026-10-06', count: 1 }, { day: '2026-10-07', count: 0 }, { day: '2026-10-08', count: 2 }]);
  });
  it('compte les choix simples et multiples avec libellés', () => {
    const d = distribution(['a', ['a', 'b'], '', null, 'zz'], [{ label: 'Alpha', value: 'a' }]);
    expect(d[0]).toEqual({ label: 'Alpha', count: 2 });
    expect(d.map((x) => x.count)).toEqual([2, 1, 1]);
  });
});
