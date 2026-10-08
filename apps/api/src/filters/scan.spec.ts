import { describe, expect, it } from 'vitest';
import { collect, pageOf } from './scan';

async function* gen(n: number, size: number) { for (let i = 0; i < n; i += size) yield Array.from({ length: Math.min(size, n - i) }, (_, k) => i + k); }
const even = (x: number) => x % 2 === 0;

describe('scan par lots', () => {
  it('pagine à travers plusieurs lots avec le bon total', async () => {
    const r = await pageOf(gen(1000, 64), even, { page: 3, size: 30, cap: 10_000 });
    expect(r.total).toBe(500); expect(r.items).toEqual(Array.from({ length: 30 }, (_, k) => (60 + k) * 2)); expect(r.truncated).toBe(false);
  });
  it('dernière page partielle et page hors limites', async () => {
    expect((await pageOf(gen(100, 7), even, { page: 2, size: 30, cap: 999 })).items.length).toBe(20);
    expect((await pageOf(gen(100, 7), even, { page: 9, size: 30, cap: 999 })).items).toEqual([]);
  });
  it('signale la troncature au-delà du plafond, jamais avant', async () => {
    expect((await pageOf(gen(100, 10), () => true, { page: 1, size: 5, cap: 100 })).truncated).toBe(false);
    const t = await pageOf(gen(101, 10), () => true, { page: 1, size: 5, cap: 100 }); expect(t.truncated).toBe(true); expect(t.total).toBe(100);
    expect((await collect(gen(101, 10), () => true, 100)).truncated).toBe(true);
  });
});
