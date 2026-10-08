'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { authApi, authDownload } from '@/lib/session';
import GroupEditor, { countConds, emptyGroup, type FieldDef, type Group } from '@/components/FilterBuilder';
import { ASTATUS, show } from '@/lib/apps';
import Logo from '@/components/Logo';
import BottomNav from '@/components/BottomNav';
import { freshLabel, useRealtime } from '@/lib/realtime';
import { getCached, setCached, emitStateChange } from '@/lib/cache';

type Item = { id: string; reference: string; status: string; submittedAt: string; answers: { value: any; field: { label: string } }[] };

function Applications() {
  const { id } = useParams<{ id: string }>(); const org = useSearchParams().get('org') ?? '';
  const cacheKey = `apps_${id}`;
  const [items, setItems] = useState<Item[] | null>(() => getCached<Item[]>(cacheKey));
  const [counts, setCounts] = useState<Record<string, number>>(() => getCached<Record<string, number>>(`counts_${id}`) || {});
  const [filter, setFilter] = useState(''); const [sel, setSel] = useState<string[]>([]); const [err, setErr] = useState('');
  const base = `/orgs/${org}/recruitments/${id}/applications`;
  const [fdefs, setFdefs] = useState<FieldDef[]>(() => getCached<FieldDef[]>(`fdefs_${id}`) || []);
  const [g, setG] = useState<Group>(emptyGroup()); const [panel, setPanel] = useState<'' | 'filter' | 'export'>('');
  const [total, setTotal] = useState<number | null>(() => getCached<number>(`total_${id}`));
  const [cols, setCols] = useState<string[] | null>(null);
  const nCond = countConds(g); const gKey = JSON.stringify(g);

  const load = useCallback(() => {
    authApi<{ counts: Record<string, number> }>(base)
      .then((r) => {
        setCounts(r.counts);
        setCached(`counts_${id}`, r.counts);
      })
      .catch(() => undefined);

    return authApi<{ items: Item[]; total: number }>(`${base}/search`, {
      method: 'POST',
      body: JSON.stringify({ status: filter || undefined, filter: nCond ? JSON.parse(gKey) : undefined }),
    })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        if (!filter && !nCond) {
          setCached(cacheKey, r.items);
          setCached(`total_${id}`, r.total);
        }
      })
      .catch((e) => setErr(e.message));
  }, [base, filter, gKey, nCond, cacheKey, id]);

  useEffect(() => {
    authApi<FieldDef[]>(`${base}/filter-fields`)
      .then((fds) => {
        setFdefs(fds);
        setCached(`fdefs_${id}`, fds);
      })
      .catch(() => undefined);
  }, [base, id]);

  // résultats mis à jour en direct (débounce) à chaque modification du filtre
  useEffect(() => {
    setSel([]);
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = () =>
    authDownload(
      `${base}/export?${new URLSearchParams({
        ...(filter ? { status: filter } : {}),
        ...(nCond ? { filter: gKey } : {}),
        ...(cols ? { columns: cols.join(',') } : {}),
      })}`,
      'candidatures.csv'
    ).catch((e) => setErr(e.message));

  const exportable = fdefs.filter((f) => f.key !== '_status');

  // temps réel : « +N nouvelle(s) candidature(s) »
  const [fresh, setFresh] = useState(0);
  const rt = useRef<ReturnType<typeof setTimeout>>();
  useRealtime(
    org,
    (e) => {
      if (e.recruitmentId !== id) return;
      if (e.type === 'application.new') {
        setFresh((n) => n + 1);
        setCounts((c) => ({ ...c, NEW: (c.NEW ?? 0) + 1 }));
      } else {
        clearTimeout(rt.current);
        rt.current = setTimeout(load, 500);
      }
    },
    () => { load(); }
  );

  const showFresh = () => {
    setFresh(0);
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function bulk(status: string) {
    try {
      await authApi(`${base}/bulk-status`, { method: 'POST', body: JSON.stringify({ ids: sel, status }) });
      setSel([]);
      emitStateChange('recruitment.updated');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const grand = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabs = [['', 'Tous', grand], ...Object.entries(ASTATUS).map(([k, v]) => [k, v.label, counts[k] ?? 0])] as [string, string, number][];

  const DOT: Record<string, string> = {
    NEW: 'bg-blue-600 text-blue-700',
    REVIEWING: 'bg-indigo-600 text-indigo-700',
    SELECTED: 'bg-emerald-600 text-emerald-700',
    REJECTED: 'bg-rose-500 text-rose-600',
    WAITING: 'bg-slate-400 text-slate-600',
  };
  const initials = (v: any) =>
    String(show(v)).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';
  const outBtn = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold shadow-xs hover:bg-slate-50 active:scale-95 transition';

  return (
    <>
      <header
        className="fixed top-0 z-30 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <Link href="/app/dashboard" aria-label="Retour aux recrutements">
            <Logo size={32} />
          </Link>
          <div className="flex items-center gap-2">
            <button
              aria-label="Filtres"
              onClick={() => setPanel(panel === 'filter' ? '' : 'filter')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
            >
              <span className="ms text-[20px]">tune</span>
            </button>
            <Link
              href="/app/security"
              aria-label="Profil"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700"
            >
              RH
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-28 pt-[4.5rem]">
        <div className="flex items-end justify-between gap-3 pt-5">
          <h1 className="font-head text-[30px] font-extrabold leading-none tracking-tight text-slate-900">
            Candidatures <span className="text-blue-700">{grand}</span>
          </h1>
          <button
            onClick={() => load()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-50/80 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 active:scale-95 transition"
          >
            <span className="ms text-[16px]">sync</span>Actualiser
          </button>
        </div>

        {fresh > 0 && (
          <button
            onClick={showFresh}
            aria-live="polite"
            className="sticky top-16 z-10 mx-auto mt-3 block rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg animate-bounce"
          >
            ↑ {freshLabel(fresh)}
          </button>
        )}

        {/* Onglets sans aucun soulignement */}
        <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {tabs.map(([k, l, n]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${
                filter === k
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-blue-50/80 text-slate-700 hover:bg-blue-100/80'
              }`}
            >
              {l}{' '}
              <span className={filter === k ? 'text-slate-300' : k === 'NEW' ? 'text-blue-700 font-extrabold' : 'text-slate-500'}>
                {n}
              </span>
            </button>
          ))}
        </div>

        <div className="card-k mt-4">
          <div className="flex items-center justify-between gap-2">
            <button
              className="flex items-center gap-2 text-sm font-bold text-slate-900 hover:text-blue-700"
              onClick={() => setPanel(panel === 'filter' ? '' : 'filter')}
            >
              <span className="ms text-[18px] text-blue-700">filter_list</span>Filtres
              {nCond > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  {nCond}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-bold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {total === null ? '…' : `${total} résultat${total > 1 ? 's' : ''}`}
              </span>
              {nCond > 0 && (
                <>
                  <span className="text-slate-300">•</span>
                  <button className="font-semibold text-blue-700 hover:text-blue-800" onClick={() => setG(emptyGroup())}>
                    Effacer
                  </button>
                </>
              )}
            </div>
          </div>
          {panel === 'filter' && (
            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              <GroupEditor g={g} fields={fdefs} onChange={setG} />
            </div>
          )}
        </div>

        {panel === 'export' && (
          <div className="card-k mt-3 space-y-3">
            <p className="text-xs text-muted">
              CSV (compatible Excel) · {total ?? 0} candidature(s) selon les filtres et l'onglet actuels
            </p>
            <div className="flex flex-wrap gap-1.5">
              {exportable.map((f) => {
                const on = !cols || cols.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      const cur = cols ?? exportable.map((x) => x.key);
                      setCols(on ? cur.filter((k) => k !== f.key) : [...cur, f.key]);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <button
              className="btn w-full !py-2.5 text-xs"
              disabled={!!cols && !cols.length}
              onClick={exportCsv}
            >
              Télécharger le CSV
            </button>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-error">{err}</p>}

        {sel.length > 0 && (
          <div className="card-k mt-3 space-y-3 shadow-md animate-[fadeup_.2s_ease-out]">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                <span className="ms text-[18px]">check</span>
              </span>
              <span className="text-sm font-bold text-slate-900">
                {sel.length} sélectionné{sel.length > 1 ? 's' : ''}
              </span>
              <button
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
                onClick={() => setSel([])}
              >
                Désélectionner
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`${outBtn} text-emerald-700 hover:bg-emerald-50`}
                onClick={() => bulk('SELECTED')}
              >
                <span className="ms text-[16px]">check</span>Retenir
              </button>
              <button
                className={`${outBtn} text-rose-600 hover:bg-rose-50`}
                onClick={() => bulk('REJECTED')}
              >
                <span className="ms text-[16px]">close</span>Écarter
              </button>
              <button
                className={`${outBtn} text-slate-600 hover:bg-slate-50`}
                onClick={() => bulk('WAITING')}
              >
                Attente
              </button>
              <button
                aria-label="Exporter"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                onClick={() => setPanel(panel === 'export' ? '' : 'export')}
              >
                <span className="ms text-[18px]">download</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {!items ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : !items.length ? (
            <p className="card-k !border-dashed p-8 text-center text-sm text-muted">
              Aucune candidature
            </p>
          ) : (
            items.map((a) => {
              const s = ASTATUS[a.status];
              const on = sel.includes(a.id);
              const d = (DOT[a.status] ?? DOT.WAITING).split(' ');
              const href = `/app/recruitments/${id}/applications/${a.id}?org=${org}`;
              return (
                <div
                  key={a.id}
                  className={`card-k flex items-center gap-3 transition-all ${
                    on ? '!border-blue-600 ring-2 ring-blue-500/10' : ''
                  }`}
                >
                  <button
                    role="checkbox"
                    aria-checked={on}
                    aria-label="Sélectionner"
                    onClick={() => setSel(on ? sel.filter((x) => x !== a.id) : [...sel, a.id])}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${
                      on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:border-slate-400'
                    }`}
                  >
                    {on && <span className="ms text-[18px]">check</span>}
                  </button>
                  <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 font-head text-base font-bold text-blue-700 shadow-xs">
                      {initials(a.answers[0]?.value)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-head text-base font-bold leading-tight text-slate-900">
                        {show(a.answers[0]?.value)}
                      </span>
                      <span className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${d[1]}`}>
                        <span className={`h-2 w-2 rounded-full ${d[0]}`} />
                        {s.label}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {a.answers.slice(1, 4).map((x) => show(x.value)).join(' · ')}
                      </span>
                    </span>
                  </Link>
                  <Link
                    href={href}
                    aria-label="Ouvrir la candidature"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-700 transition"
                  >
                    <span className="ms text-[18px]">arrow_forward</span>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </main>
      <BottomNav
        variant="cand"
        active="cand"
        candidaturesHref={`/app/recruitments/${id}/applications?org=${org}`}
        selectedHref={`/app/recruitments/${id}/selected?org=${org}`}
        statsHref={`/app/recruitments/${id}/stats?org=${org}`}
      />
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}>
      <Applications />
    </Suspense>
  );
}
