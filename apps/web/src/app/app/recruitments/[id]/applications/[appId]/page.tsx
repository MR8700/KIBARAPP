'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';
import { ASTATUS, fmt, show } from '@/lib/apps';
import FileViewer from '@/components/FileViewer';

function Dossier() {
  const { id, appId } = useParams<{ id: string; appId: string }>(); const org = useSearchParams().get('org') ?? '';
  const [view, setView] = useState<{ url: string; name: string; mime: string } | null>(null);
  const router = useRouter(); const [confirmDel, setConfirmDel] = useState(false); const [deleting, setDeleting] = useState(false);
  const [a, setA] = useState<any>(null); const [err, setErr] = useState('');
  const base = `/orgs/${org}/recruitments/${id}/applications/${appId}`;
  const load = () => authApi<any>(base).then(setA).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [base]);
  async function remove() {
    setDeleting(true); setErr('');
    try { await authApi(base, { method: 'DELETE' }); router.replace(`/app/recruitments/${id}/applications?org=${org}`); }
    catch (e: any) { setErr(e.message); setDeleting(false); setConfirmDel(false); }
  }
  const mo = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
  /** Affichage (URL « inline ») ou téléchargement direct (URL « attachment ») : l'autorisation est revérifiée à chaque appel. */
  async function open(f: any, download: boolean) {
    setErr('');
    try { const r = await authApi<{ url: string; name: string; mime: string }>(`${base}/files/${f.id}${download ? '?download=1' : ''}`);
      if (download) { const l = document.createElement('a'); l.href = r.url; l.download = r.name; l.rel = 'noopener'; document.body.appendChild(l); l.click(); l.remove(); } else setView(r); }
    catch (e: any) { setErr(e.message); }
  }
  async function set(status: string) { try { await authApi(`${base}/status`, { method: 'POST', body: JSON.stringify({ status }) }); load(); } catch (e: any) { setErr(e.message); } }
  if (!a) return <main className="p-10 text-center text-sm text-muted">{err || 'Chargement…'}</main>;
  const s = ASTATUS[a.status];
  return (<main className="mx-auto max-w-md px-5 pb-28 pt-6">
    <Link href={`/app/recruitments/${id}/applications?org=${org}`} className="text-sm text-muted">← Candidatures</Link>
    <h1 className="mt-3 font-mono text-lg font-bold">{a.reference}</h1>
    <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
    {err && <p className="mt-3 text-sm text-error">{err}</p>}
    <div className="mt-5 space-y-3">{a.answers.map((r: any) => <div key={r.id} className="card"><p className="text-xs text-muted">{r.field.label}</p><p className="mt-0.5 break-words text-sm font-medium">{show(r.value)}</p></div>)}</div>
    {a.files?.length > 0 && <><h2 className="mb-3 mt-7 text-base font-bold">Documents ({a.files.length})</h2>
      <div className="space-y-2">{a.files.map((f: any) => { const ok = f.scanStatus === 'CLEAN';
        const st = ok ? null : f.scanStatus === 'PENDING' ? ['Vérification en cours…', 'text-amber-600'] : f.scanStatus === 'INFECTED' ? ['Bloqué par l\'antivirus', 'text-red-600'] : ['Indisponible', 'text-slate-500'];
        const icon = f.mime.startsWith('image/') ? 'image' : f.mime === 'application/pdf' ? 'picture_as_pdf' : f.mime.startsWith('video/') ? 'movie' : f.mime.startsWith('audio/') ? 'audio_file' : 'description';
        return (<div key={f.id} className="card-k flex items-center gap-3 !p-3">
          <button disabled={!ok} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60" onClick={() => open(f, false)}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><span className="ms text-[24px]">{icon}</span></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{f.name}</span>
              <span className={`block text-xs ${st ? st[1] : 'text-slate-500'}`}>{st ? st[0] : mo(f.size)}</span></span></button>
          <button disabled={!ok} aria-label={`Télécharger ${f.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700 disabled:opacity-40" onClick={() => open(f, true)}><span className="ms text-[22px]">download</span></button></div>); })}</div></>}
    {view && <FileViewer {...view} onClose={() => setView(null)} onDownload={() => { const f = a.files.find((x: any) => x.name === view.name); if (f) void open(f, true); }} />}
    <h2 className="mb-3 mt-7 text-base font-bold">Historique</h2>
    <ol className="space-y-2 border-l-2 border-line pl-4">{[...a.history].map((h: any) => <li key={h.id} className="text-sm"><span className="font-medium">{ASTATUS[h.status].label}</span> <span className="text-xs text-muted">{fmt(h.at)}</span></li>)}</ol>
    <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-md gap-2">
        <button className="btn flex-1 !bg-success !px-3 !py-2.5 text-xs" onClick={() => set('SELECTED')}>Retenir</button>
        <button className="btn flex-1 !bg-error !px-3 !py-2.5 text-xs" onClick={() => set('REJECTED')}>Écarter</button>
        <button className="flex-1 rounded-xl border border-line px-3 py-2.5 text-xs font-semibold" onClick={() => set('WAITING')}>Attente</button></div></div>
    <div className="mx-auto mt-6 max-w-md px-5 pb-10">
      {!confirmDel ? <button className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-700" onClick={() => setConfirmDel(true)}><span className="ms text-[18px]">delete</span>Supprimer cette candidature</button>
        : <div role="alertdialog" className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-semibold text-red-800">Supprimer définitivement cette candidature et ses fichiers ?</p><p className="mt-1 text-xs text-red-700">Cette action est irréversible.</p>
          <div className="mt-3 flex gap-2"><button className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold" disabled={deleting} onClick={() => setConfirmDel(false)}>Annuler</button>
            <button className="min-h-[44px] flex-1 rounded-xl bg-red-600 text-sm font-bold text-white" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Suppression…' : 'Supprimer'}</button></div></div>}</div>
  </main>);
}

export default function Page() { return <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}><Dossier /></Suspense>; }
