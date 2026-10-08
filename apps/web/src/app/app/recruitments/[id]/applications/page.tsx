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

type Item = { id: string; reference: string; status: string; submittedAt: string; answers: { value: any; field: { label: string } }[] };

function Applications() {
  const { id } = useParams<{ id: string }>(); const org = useSearchParams().get('org') ?? '';
  const [items, setItems] = useState<Item[] | null>(null); const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState(''); const [sel, setSel] = useState<string[]>([]); const [err, setErr] = useState('');
  const base = `/orgs/${org}/recruitments/${id}/applications`;
  const [fdefs, setFdefs] = useState<FieldDef[]>([]); const [g, setG] = useState<Group>(emptyGroup()); const [panel, setPanel] = useState<'' | 'filter' | 'export'>('');
  const [total, setTotal] = useState<number | null>(null); const [cols, setCols] = useState<string[] | null>(null);
  const nCond = countConds(g); const gKey = JSON.stringify(g);
  const load = useCallback(() => {
    authApi<{ counts: Record<string, number> }>(base).then((r) => setCounts(r.counts)).catch(() => undefined);
    return authApi<{ items: Item[]; total: number }>(`${base}/search`, { method: 'POST', body: JSON.stringify({ status: filter || undefined, filter: nCond ? JSON.parse(gKey) : undefined }) })
      .then((r) => { setItems(r.items); setTotal(r.total); }).catch((e) => setErr(e.message));
  }, [base, filter, gKey, nCond]);
  useEffect(() => { authApi<FieldDef[]>(`${base}/filter-fields`).then(setFdefs).catch(() => undefined); }, [base]);
  // résultats mis à jour en direct (débounce) à chaque modification du filtre
  useEffect(() => { setSel([]); const t = setTimeout(load, 350); return () => clearTimeout(t); }, [load]);
  const exportCsv = () => authDownload(`${base}/export?${new URLSearchParams({ ...(filter ? { status: filter } : {}), ...(nCond ? { filter: gKey } : {}), ...(cols ? { columns: cols.join(',') } : {}) })}`, 'candidatures.csv').catch((e) => setErr(e.message));
  const exportable = fdefs.filter((f) => f.key !== '_status');

  // temps réel : « +N nouvelle(s) candidature(s) » sans bousculer la liste en cours de lecture
  const [fresh, setFresh] = useState(0); const rt = useRef<ReturnType<typeof setTimeout>>();
  useRealtime(org, (e) => {
    if (e.recruitmentId !== id) return;
    if (e.type === 'application.new') { setFresh((n) => n + 1); setCounts((c) => ({ ...c, NEW: (c.NEW ?? 0) + 1 })); }
    else { clearTimeout(rt.current); rt.current = setTimeout(load, 500); }
  }, () => { load(); });
  const showFresh = () => { setFresh(0); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  async function bulk(status: string) {
    try { await authApi(`${base}/bulk-status`, { method: 'POST', body: JSON.stringify({ ids: sel, status }) }); setSel([]); load(); } catch (e: any) { setErr(e.message); }
  }
  const grand = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabs = [['', 'Tous', grand], ...Object.entries(ASTATUS).map(([k, v]) => [k, v.label, counts[k] ?? 0])] as [string, string, number][];

  const DOT: Record<string, string> = { NEW: 'bg-blue-700 text-blue-700', REVIEWING: 'bg-blue-600 text-blue-700', SELECTED: 'bg-emerald-600 text-emerald-700', REJECTED: 'bg-red-500 text-red-600', WAITING: 'bg-slate-400 text-slate-500' };
  const initials = (v: any) => String(show(v)).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';
  const outBtn = 'inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-sm font-semibold active:scale-95';

  return (<>
    <header className="fixed top-0 z-30 w-full border-b border-slate-100 bg-white/90 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5"><Link href="/app/dashboard" aria-label="Retour aux recrutements"><Logo size={32} /></Link>
        <div className="flex items-center gap-2">
          <button aria-label="Filtres" onClick={() => setPanel(panel === 'filter' ? '' : 'filter')} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-slate-700"><span className="ms text-[20px]">tune</span></button>
          <Link href="/app/security" aria-label="Profil" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">RH</Link></div></div></header>
    <main className="mx-auto max-w-md px-5 pb-28 pt-[4.5rem]">
      <div className="flex items-end justify-between gap-3 pt-5"><h1 className="font-head text-[32px] font-extrabold leading-none tracking-tight text-slate-900">Candidatures <span className="text-blue-700">{grand}</span></h1>
        <button onClick={() => load()} className="inline-flex shrink-0 items-center gap-1 border-b-[3px] border-slate-300 px-1 pb-0.5 text-sm font-semibold text-blue-700"><span className="ms text-[16px]">sync</span>Actualiser</button></div>
      {fresh > 0 && <button onClick={showFresh} aria-live="polite" className="sticky top-16 z-10 mx-auto mt-3 block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-lg">↑ {freshLabel(fresh)}</button>}
      <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1">{tabs.map(([k, l, n]) => (
        <button key={k} onClick={() => setFilter(k)} className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${filter === k ? 'bg-slate-900 text-white' : 'bg-blue-50 text-slate-700'}`}>{l} <span className={filter === k ? 'text-slate-300' : k === 'NEW' ? 'text-blue-700' : 'text-slate-600'}>{n}</span></button>))}</div>
      <div className="card-k mt-4">
        <div className="flex items-center justify-between gap-2"><button className="flex items-center gap-2 text-sm font-bold text-slate-900" onClick={() => setPanel(panel === 'filter' ? '' : 'filter')}><span className="ms text-[18px] text-blue-700">filter_list</span>Filtres{nCond > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-[11px] text-white">{nCond}</span>}</button>
          <div className="flex items-center gap-2 text-sm"><span className="flex items-center gap-1.5 font-bold text-slate-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />{total === null ? '…' : `${total} résultat${total > 1 ? 's' : ''}`}</span>
            {nCond > 0 && <><span className="text-slate-300">•</span><button className="font-semibold text-blue-700" onClick={() => setG(emptyGroup())}>Effacer</button></>}</div></div>
        {panel === 'filter' && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3"><GroupEditor g={g} fields={fdefs} onChange={setG} /></div>}</div>
      {panel === 'export' && <div className="card-k mt-3 space-y-3"><p className="text-xs text-muted">CSV (compatible Excel) · {total ?? 0} candidature(s) selon les filtres et l'onglet actuels</p>
        <div className="flex flex-wrap gap-1.5">{exportable.map((f) => { const on = !cols || cols.includes(f.key); return <button key={f.key} type="button"
          onClick={() => { const cur = cols ?? exportable.map((x) => x.key); setCols(on ? cur.filter((k) => k !== f.key) : [...cur, f.key]); }}
          className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-primary bg-primary text-white' : 'border-line bg-white'}`}>{f.label}</button>; })}</div>
        <button className="btn w-full !py-2.5 text-xs" disabled={!!cols && !cols.length} onClick={exportCsv}>Télécharger le CSV</button></div>}
      {err && <p className="mt-3 text-sm text-error">{err}</p>}
      {sel.length > 0 && <div className="card-k mt-3 space-y-3">
        <div className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-700 text-white"><span className="ms text-[18px]">check</span></span>
          <span className="text-sm font-bold text-slate-900">{sel.length} sélectionné{sel.length > 1 ? 's' : ''}</span>
          <button className="text-sm font-medium text-slate-600 underline underline-offset-4" onClick={() => setSel([])}>Désélectionner</button></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`${outBtn} border border-slate-200 text-emerald-700`} style={{ borderBottomWidth: 3 }} onClick={() => bulk('SELECTED')}><span className="ms text-[16px]">check</span>Retenir</button>
          <button className={`${outBtn} border border-slate-200 text-red-600`} style={{ borderBottomWidth: 3 }} onClick={() => bulk('REJECTED')}><span className="ms text-[16px]">close</span>Écarter</button>
          <button className={`${outBtn} border border-slate-200 text-slate-600`} style={{ borderBottomWidth: 3 }} onClick={() => bulk('WAITING')}>Attente</button>
          <button aria-label="Exporter" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700" onClick={() => setPanel(panel === 'export' ? '' : 'export')}><span className="ms text-[18px]">download</span></button></div></div>}
      <div className="mt-4 space-y-3">{!items ? <p className="text-sm text-muted">Chargement…</p> : !items.length
        ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">Aucune candidature</p>
        : items.map((a) => { const s = ASTATUS[a.status]; const on = sel.includes(a.id); const d = (DOT[a.status] ?? DOT.WAITING).split(' '); const href = `/app/recruitments/${id}/applications/${a.id}?org=${org}`; return (
          <div key={a.id} className={`card-k flex items-center gap-3 ${on ? '!border-blue-600' : ''}`}>
            <button role="checkbox" aria-checked={on} aria-label="Sélectionner" onClick={() => setSel(on ? sel.filter((x) => x !== a.id) : [...sel, a.id])} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white'}`}>{on && <span className="ms text-[18px]">check</span>}</button>
            <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white bg-blue-50 font-head text-base font-bold text-blue-700 shadow">{initials(a.answers[0]?.value)}</span>
              <span className="min-w-0 flex-1"><span className="block break-words font-head text-base font-bold leading-tight text-slate-900">{show(a.answers[0]?.value)}</span>
                <span className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${d[1]}`}><span className={`h-1.5 w-1.5 rounded-full ${d[0]}`} />{s.label}</span>
                <span className="mt-1 block text-sm text-slate-600">{a.answers.slice(1, 4).map((x) => show(x.value)).join(' · ')}</span></span></Link>
            <Link href={href} aria-label="Ouvrir la candidature" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700"><span className="ms text-[20px]">arrow_forward</span></Link></div>); })}</div>
    </main>
    <BottomNav variant="cand" active="cand" candidaturesHref="#" dot={(counts.NEW ?? 0) > 0} statsHref={`/app/recruitments/${id}/stats?org=${org}`} />
  </>);
}

export default function Page() { return <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}><Applications /></Suspense>; }
