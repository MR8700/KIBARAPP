'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';
import { useRealtime } from '@/lib/realtime';
import { ASTATUS } from '@/lib/apps';

type S = { title: string; total: number; counts: Record<string, number>; selectedRate: number; perDay: { day: string; count: number }[]; distributions: { key: string; label: string; items: { label: string; count: number }[] }[] };

function Stats() {
  const { id } = useParams<{ id: string }>(); const org = useSearchParams().get('org') ?? '';
  const [s, setS] = useState<S | null>(null); const [err, setErr] = useState(''); const t = useRef<ReturnType<typeof setTimeout>>();
  const load = useCallback(() => { authApi<S>(`/orgs/${org}/recruitments/${id}/stats`).then(setS).catch((e) => setErr(e.message)); }, [org, id]);
  useEffect(() => { load(); }, [load]);
  useRealtime(org, (e) => { if (e.recruitmentId === id) { clearTimeout(t.current); t.current = setTimeout(load, 800); } }, load);
  if (!s) return <main className="p-10 text-center text-sm text-muted">{err || 'Chargement…'}</main>;
  const max = Math.max(1, ...s.perDay.map((d) => d.count));

  return (<main className="mx-auto max-w-md px-5 pb-16 pt-6">
    <Link href={`/app/recruitments/${id}/applications?org=${org}`} className="text-sm text-muted">← Candidatures</Link>
    <h1 className="mt-3 font-head text-2xl font-bold">Statistiques</h1><p className="mt-1 break-words text-sm text-muted">{s.title}</p>
    <div className="card mt-5 grid grid-cols-2 divide-x divide-line text-center">
      <div><p className="font-head text-2xl font-bold">{s.total}</p><p className="mt-1 text-[11px] uppercase tracking-wider text-muted">Candidatures</p></div>
      <div><p className="font-head text-2xl font-bold">{s.selectedRate} %</p><p className="mt-1 text-[11px] uppercase tracking-wider text-muted">Retenus</p></div></div>

    <h2 className="mb-2 mt-7 text-base font-bold">Par statut</h2>
    <div className="card space-y-2">{Object.entries(ASTATUS).map(([k, v]) => { const n = s.counts[k] ?? 0; return (
      <div key={k}><div className="flex justify-between text-xs"><span>{v.label}</span><span className="font-semibold">{n}</span></div>
        <div className="mt-1 h-2 rounded-full bg-subtle"><div className="h-2 rounded-full bg-primary" style={{ width: `${s.total ? (n / s.total) * 100 : 0}%` }} /></div></div>); })}</div>

    <h2 className="mb-2 mt-7 text-base font-bold">30 derniers jours</h2>
    <div className="card"><div className="flex h-24 items-end gap-[2px]" role="img" aria-label="Candidatures par jour sur 30 jours">
      {s.perDay.map((d) => <div key={d.day} title={`${d.day} : ${d.count}`} className="flex-1 rounded-t bg-electric-blue" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />)}</div>
      <div className="mt-1 flex justify-between text-[10px] text-muted"><span>{s.perDay[0].day.slice(5)}</span><span>Pic : {max}/jour</span><span>{s.perDay[s.perDay.length - 1].day.slice(5)}</span></div></div>

    {s.distributions.map((d) => { const m = Math.max(...d.items.map((i) => i.count)); return (<section key={d.key}>
      <h2 className="mb-2 mt-7 text-base font-bold">{d.label}</h2>
      <div className="card space-y-2">{d.items.map((i) => (<div key={i.label}><div className="flex justify-between gap-3 text-xs"><span className="min-w-0 truncate">{i.label}</span><span className="font-semibold">{i.count}</span></div>
        <div className="mt-1 h-2 rounded-full bg-subtle"><div className="h-2 rounded-full bg-sahel-gold" style={{ width: `${(i.count / m) * 100}%` }} /></div></div>))}</div></section>); })}
  </main>);
}

export default function Page() { return <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}><Stats /></Suspense>; }
