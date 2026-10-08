'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';

type Item = { id: string; action: string; at: string; user: string; meta: Record<string, unknown> };
const LABELS: Record<string, string> = {
  'applications.export': 'Export CSV des candidatures', 'selected.export': 'Export des retenus', 'selected.config': 'Colonnes des retenus modifiées',
  'application.bulk_status': 'Changement de statut', 'file.access': 'Accès à un document',
};
const FILTERS: [string, string][] = [['', 'Tout'], ['application', 'Candidatures'], ['selected', 'Retenus'], ['file', 'Documents']];

function Audit() {
  const org = useSearchParams().get('org') ?? '';
  const [items, setItems] = useState<Item[] | null>(null); const [next, setNext] = useState<string | null>(null); const [action, setAction] = useState(''); const [err, setErr] = useState('');
  const fetchPage = useCallback((before?: string) => authApi<{ items: Item[]; next: string | null }>(`/orgs/${org}/audit?${new URLSearchParams({ ...(before ? { before } : {}), ...(action ? { action } : {}) })}`), [org, action]);
  useEffect(() => { setItems(null); fetchPage().then((r) => { setItems(r.items); setNext(r.next); }).catch((e) => setErr(e.message)); }, [fetchPage]);
  const more = () => next && fetchPage(next).then((r) => { setItems((i) => [...(i ?? []), ...r.items]); setNext(r.next); }).catch((e) => setErr(e.message));
  const detail = (m: Record<string, unknown>) => Object.entries(m).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join(' · ');

  return (<main className="mx-auto max-w-md px-5 pb-16 pt-6">
    <Link href="/app/dashboard" className="text-sm text-muted">← Recrutements</Link>
    <h1 className="mt-3 font-head text-2xl font-bold">Journal d'audit</h1>
    <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">{FILTERS.map(([k, l]) => (
      <button key={k} onClick={() => setAction(k)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${action === k ? 'border-primary bg-primary text-white' : 'border-line bg-white'}`}>{l}</button>))}</div>
    {err && <p className="mt-3 text-sm text-error">{err}</p>}
    <ul className="mt-4 space-y-2">{!items ? <li className="text-sm text-muted">Chargement…</li> : !items.length ? <li className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">Aucune entrée</li>
      : items.map((i) => (<li key={i.id} className="card"><p className="text-sm font-semibold">{LABELS[i.action] ?? i.action}</p>
        <p className="mt-0.5 text-xs text-muted">{i.user} · {new Date(i.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        {detail(i.meta) && <p className="mt-1 break-words font-mono text-[11px] text-muted">{detail(i.meta)}</p>}</li>))}</ul>
    {next && <button className="btn mt-4 w-full !py-2.5 text-xs" onClick={more}>Charger plus</button>}
  </main>);
}

export default function Page() { return <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}><Audit /></Suspense>; }
