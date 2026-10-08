/** Fonctions pures de statistiques (testées), indépendantes de la base. */
export function bucketByDay(dates: Date[], days: number, now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out = Array.from({ length: days }, (_, i) => ({ day: new Date(end - (days - 1 - i) * 864e5).toISOString().slice(0, 10), count: 0 }));
  const idx = new Map(out.map((d, i) => [d.day, i]));
  for (const d of dates) { const i = idx.get(d.toISOString().slice(0, 10)); if (i !== undefined) out[i].count++; }
  return out;
}

/** Répartition des réponses d'un champ à choix (single/multi), libellés d'options appliqués. */
export function distribution(values: unknown[], options: { label: string; value: string }[]) {
  const c = new Map<string, number>();
  for (const v of values) for (const x of ([] as unknown[]).concat(v ?? [])) { if (x === '' || x === null || x === undefined) continue; const k = String(x); c.set(k, (c.get(k) ?? 0) + 1); }
  return [...c.entries()].map(([k, count]) => ({ label: options.find((o) => o.value === k)?.label ?? k, count })).sort((a, b) => b.count - a.count);
}
