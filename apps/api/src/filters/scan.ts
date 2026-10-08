/**
 * Évaluation par lots (curseur) : mêmes règles que l'évaluateur en mémoire (evalGroup), sans plafond de 5000 lignes
 * ni chargement complet : seule la page demandée est conservée. Coût O(N) lectures, mémoire O(page).
 */
export async function pageOf<R>(batches: AsyncIterable<R[]>, match: (r: R) => boolean, o: { page: number; size: number; cap: number }) {
  const from = (o.page - 1) * o.size, to = from + o.size;
  let seen = 0, total = 0, truncated = false; const items: R[] = [];
  outer: for await (const b of batches) for (const r of b) {
    if (seen++ >= o.cap) { truncated = true; break outer; }
    if (!match(r)) continue;
    if (total >= from && total < to) items.push(r);
    total++;
  }
  return { items, total, truncated };
}

export async function collect<R>(batches: AsyncIterable<R[]>, match: (r: R) => boolean, cap: number) {
  let seen = 0, truncated = false; const rows: R[] = [];
  outer: for await (const b of batches) for (const r of b) {
    if (seen++ >= cap) { truncated = true; break outer; }
    if (match(r)) rows.push(r);
  }
  return { rows, truncated };
}
