'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authApi, currentOrg, setCurrentOrg, STATUS } from '@/lib/session';
import Logo from '@/components/Logo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';
import { freshLabel, useRealtime } from '@/lib/realtime';

type Org = { id: string; name: string; role: string; userName?: string };
type Rec = { id: string; title: string; status: string; endsAt: string | null; publicToken: string; _count: { applications: number }; selectedCount?: number };

export default function Dashboard() {
  const [orgs, setOrgs] = useState<Org[] | null>(null); const [org, setOrg] = useState('');
  const [recs, setRecs] = useState<Rec[] | null>(null); const [name, setName] = useState(''); const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [toast, setToast] = useState(''); const [tick, setTick] = useState(0); const recsRef = useRef<Rec[] | null>(null); recsRef.current = recs; const tt = useRef<ReturnType<typeof setTimeout>>();
  useRealtime(org, (e) => {
    if (e.type !== 'application.new') return;
    setTick((t) => t + 1);
    const title = recsRef.current?.find((r) => r.id === e.recruitmentId)?.title;
    setRecs((rs) => rs && rs.map((r) => (r.id === e.recruitmentId ? { ...r, _count: { applications: r._count.applications + 1 } } : r)));
    setToast(`${freshLabel(1)}${title ? ` · ${title}` : ''}`); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(''), 4000);
  }, () => { if (org) authApi<Rec[]>(`/orgs/${org}/recruitments`).then(setRecs).catch(() => undefined); });

  useEffect(() => { authApi<Org[]>('/orgs').then((o) => { setOrgs(o); const cur = o.find((x) => x.id === currentOrg()) ?? o[0]; if (cur) { setOrg(cur.id); setCurrentOrg(cur.id); } }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (org) { setRecs(null); authApi<Rec[]>(`/orgs/${org}/recruitments`).then(setRecs).catch((e) => setErr(e.message)); } }, [org]);

  async function createOrg() {
    try { const o = await authApi<Org>('/orgs', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); setOrgs([o]); setOrg(o.id); setCurrentOrg(o.id); } catch (e: any) { setErr(e.message); }
  }
  const link = (t: string) => `${location.origin}/r/${t}`;

  if (!orgs) return <main className="p-10 text-center text-sm text-muted">{err || 'Chargement…'}</main>;
  if (!orgs.length) return (<main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-10">
    <Logo size={36} />
    <h1 className="mt-8 font-head text-2xl font-bold tracking-tight">Dernière étape avant de commencer</h1>
    <p className="mt-2 text-base text-slate-600">Comment s'appelle votre entreprise ou votre organisation ? Elle apparaîtra sur vos offres.</p>
    <label className="mt-6 block"><span className="mb-2 block text-[15px] font-semibold">Nom de votre organisation</span>
      <input className="field-k" placeholder="Ex. Société Faso Services" autoFocus enterKeyHint="go" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && createOrg()} /></label>
    {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
    <button className="btn mt-auto w-full !py-4 text-base" disabled={name.trim().length < 2} onClick={createOrg}>Continuer<span className="ms text-[20px]">arrow_forward</span></button></main>);

  const cur = orgs.find((o) => o.id === org);
  const canCreate = cur?.role === 'ADMIN' || cur?.role === 'RECRUTEUR';
  const active = recs?.filter((r) => r.status === 'ACTIVE').length ?? 0;
  const total = recs?.reduce((n, r) => n + r._count.applications, 0) ?? 0;
  const kept = recs?.reduce((n, r) => n + (r.selectedCount ?? 0), 0) ?? 0;
  const first = (cur?.userName || '').trim().split(/\s+/)[0] || '';
  const withApps = recs?.find((r) => r._count.applications > 0);
  const candHref = withApps ? `/app/recruitments/${withApps.id}/applications?org=${org}` : '/app/dashboard';
  const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
  const dot: Record<string, string> = { ACTIVE: 'bg-emerald-500', PREVIEW: 'bg-amber-500' };
  const txt: Record<string, string> = { ACTIVE: 'text-emerald-700 font-medium' };

  return (<>
    {toast && <div role="status" aria-live="polite" className="fixed inset-x-0 top-3 z-[60] mx-auto w-fit max-w-[90vw] truncate rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lg">{toast}</div>}
    <header className="fixed top-0 z-50 w-full border-b border-slate-100 bg-white/90 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
        <Logo size={32} />
        <div className="flex items-center gap-2"><NotificationBell tick={tick} />
          <Link href="/app/security" aria-label="Profil et sécurité" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{(first || cur?.name || 'K').charAt(0).toUpperCase()}</Link></div>
      </div></header>
    <main className="mx-auto max-w-md px-5 pb-28 pt-16">
      <div className="pb-4 pt-5"><h1 className="break-words font-head text-2xl font-bold tracking-tight text-slate-900">{first ? `Bonjour ${first}` : 'Bonjour'}</h1>
        <div className="mt-1 flex items-center gap-1.5"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /><span className="truncate text-xs font-medium text-slate-500">Espace {cur?.name} • Actif</span></div>
        {canCreate && <Link href="/app/recruitments/new" className="btn mt-3 !rounded-xl !px-3.5 !py-2 text-xs" style={{ borderBottomWidth: 3.5, boxShadow: '0 4px 10px rgba(37,99,235,.3), inset 0 1px 0 rgba(255,255,255,.3)', backgroundColor: '#2563eb' }}><span className="ms text-[16px]">add</span>Créer un recrutement</Link>}</div>
      <div className="card-k my-3 grid grid-cols-3 divide-x divide-slate-100 p-3.5 text-center">
        {[[active, 'Actifs', ''], [total, 'Candidats', ''], [kept, 'Retenus', 'text-blue-600']].map(([n, l, c]) => (
          <div key={l as string} className="flex min-w-0 flex-col items-center px-1"><span className={`font-head text-2xl font-bold leading-none tracking-tight ${c || 'text-slate-900'}`}>{n}</span><span className="mt-1.5 w-full truncate text-[11px] font-medium uppercase tracking-wider text-slate-400">{l}</span></div>))}</div>
      <div className="flex items-center justify-between pb-3 pt-5"><h2 className="text-base font-bold tracking-tight text-slate-900">Mes recrutements</h2>
        {cur?.role === 'ADMIN' ? <Link href={`/app/audit?org=${org}`} className="flex items-center gap-1 text-xs font-medium text-slate-500">Filtrer<span className="ms text-[15px]">tune</span></Link> : <span className="flex items-center gap-1 text-xs font-medium text-slate-500">Filtrer<span className="ms text-[15px]">tune</span></span>}</div>
      {err && <p className="mb-3 text-sm text-error">{err}</p>}
      {!recs ? <p className="text-sm text-muted">Chargement…</p> : !recs.length ? (
        <div className="card-k flex flex-col items-center !p-7 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-primary"><span className="ms text-[34px]">rocket_launch</span></span>
          <p className="mt-4 font-head text-lg font-bold text-slate-900">Lancez votre premier recrutement</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">C'est rapide : vous choisissez un modèle, vous partagez le lien, et les candidatures arrivent ici.</p>
          {canCreate && <Link href="/app/recruitments/new" className="btn mt-5 w-full !py-3.5 text-base">Créer mon premier recrutement</Link>}</div>
      ) : <div className="flex flex-col gap-3">{recs.map((r) => { const s = STATUS[r.status]; const isDraft = r.status === 'DRAFT' || r.status === 'PREVIEW';
        const open = isDraft ? `/app/recruitments/${r.id}/builder?org=${org}` : `/app/recruitments/${r.id}/applications?org=${org}`;
        if (isDraft) return (
          <div key={r.id} className="card-k !border-dashed !bg-white"><div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1"><h3 className="break-words text-base font-medium tracking-tight text-slate-700">{r.title}</h3>
              <p className="mt-1 text-xs text-slate-400">{s.label} • Étape {r.status === 'PREVIEW' ? '3' : '2'}/3</p></div>
            <Link href={open} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 active:scale-95" style={{ borderBottom: '3.5px solid #1e3a8a', boxShadow: '0 4px 10px rgba(37,99,235,.3), inset 0 1px 0 rgba(255,255,255,.3)' }}>Reprendre<span className="ms text-[15px]">arrow_forward</span></Link></div></div>);
        return (
          <div key={r.id} className="card-k"><div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold tracking-tight text-slate-900">{r.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className={`inline-flex shrink-0 items-center gap-1 ${txt[r.status] ?? ''}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[r.status] ?? 'bg-slate-400'}`} />{s.label}</span>
                {r.endsAt && <><span className="text-slate-300">•</span><span className="inline-flex shrink-0 items-center gap-1"><span className="ms text-[13px] text-slate-400">calendar_today</span>{day(r.endsAt)}</span></>}</div></div>
            <Link href={open} aria-label={`Ouvrir ${r.title}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 active:scale-95"><span className="ms text-[18px]">arrow_forward</span></Link></div>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3">
            <Link href={open} className="flex min-w-0 items-baseline gap-1.5"><span className="font-head text-xl font-bold text-slate-900">{r._count.applications}</span><span className="truncate text-xs text-slate-500">Candidatures</span></Link>
            <Link href={`/app/recruitments/${r.id}/selected?org=${org}`} className="flex min-w-0 items-baseline gap-1.5"><span className="font-head text-xl font-bold text-slate-900">{r.selectedCount ?? 0}</span><span className="truncate text-xs text-slate-500">Retenus</span></Link></div>
          <div className="mt-2 flex gap-3 text-[11px] font-semibold">
            {r._count.applications > 0 && <Link className="text-slate-500" href={`/app/recruitments/${r.id}/stats?org=${org}`}>Stats</Link>}
            {r.status === 'ACTIVE' && <button className="text-primary" onClick={() => { navigator.clipboard.writeText(link(r.publicToken)); setCopied(r.id); setTimeout(() => setCopied(''), 1800); }}>{copied === r.id ? 'Lien copié ✓' : 'Copier le lien'}</button>}</div></div>); })}</div>}
    </main>
    <BottomNav active="rec" candidaturesHref={candHref} dot={(recs?.some((r) => r._count.applications > 0)) ?? false} />
  </>);
}
