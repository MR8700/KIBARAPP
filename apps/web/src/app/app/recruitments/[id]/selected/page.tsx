'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { authApi, authDownload } from '@/lib/session';
import { useRealtime } from '@/lib/realtime';

type Col = { key: string; label: string; visible: boolean };
type Row = { id: string; reference: string; cells: Record<string, string> };
type View = { title: string; canEdit: boolean; total: number; truncated: boolean; columns: Col[]; rows: Row[] };

function Selected() {
  const { id } = useParams<{ id: string }>(); const org = useSearchParams().get('org') ?? '';
  const base = `/orgs/${org}/recruitments/${id}/selected`;
  const [data, setData] = useState<View | null>(null); const [cols, setCols] = useState<Col[] | null>(null);
  const [panel, setPanel] = useState(false); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const saved = useRef(''); const t = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(() => authApi<View>(base).then((r) => {
    const prev = saved.current; saved.current = JSON.stringify(r.columns);
    setData(r); setCols((p) => (!p || JSON.stringify(p) === prev ? r.columns : p)); // ne pas écraser des modifications non enregistrées
  }).catch((e) => setErr(e.message)), [base]);
  useEffect(() => { load(); }, [load]);
  // un candidat retenu/écarté ailleurs met la liste à jour en direct
  useRealtime(org, (e) => { if (e.type === 'application.status' && e.recruitmentId === id) { clearTimeout(t.current); t.current = setTimeout(load, 500); } }, load);

  if (!data || !cols) return <main className="p-10 text-center text-sm text-muted">{err || 'Chargement…'}</main>;
  const shown = cols.filter((c) => c.visible); const dirty = JSON.stringify(cols) !== saved.current;
  const move = (i: number, d: -1 | 1) => setCols((c) => { const n = [...c!]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const toggle = (i: number) => setCols((c) => c!.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)));

  async function save() {
    setBusy('save'); setErr(''); setMsg('');
    try { const r = await authApi<{ columns: Col[] }>(`${base}/config`, { method: 'PUT', body: JSON.stringify({ columns: cols!.map(({ key, visible }) => ({ key, visible })) }) });
      saved.current = JSON.stringify(r.columns); setCols(r.columns); setMsg('Colonnes enregistrées'); setTimeout(() => setMsg(''), 2500);
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  }
  async function exportAs(format: 'xlsx' | 'pdf' | 'csv') {
    setBusy(format); setErr('');
    try { await authDownload(`${base}/export?${new URLSearchParams({ format, columns: shown.map((c) => c.key).join(',') })}`, `retenus-${new Date().toISOString().slice(0, 10)}.${format}`); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  }
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (<main className="mx-auto max-w-5xl px-5 pb-16 pt-6 print:max-w-none print:p-0">
    <Link href={`/app/recruitments/${id}/applications?org=${org}`} className="text-sm text-muted print:hidden">← Candidatures</Link>
    <div className="mt-3 flex items-end justify-between gap-3">
      <div className="min-w-0"><h1 className="break-words font-head text-2xl font-bold">Retenus</h1>
        <p className="mt-1 text-sm text-muted">{data.title} · {data.total} candidat{data.total > 1 ? 's' : ''} retenu{data.total > 1 ? 's' : ''}<span className="hidden print:inline"> · {today}</span></p></div>
    </div>
    {data.truncated && <p className="mt-2 text-xs text-sahel-gold print:hidden">Affichage limité aux 5000 plus récents.</p>}

    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold print:hidden">
      <button className={`rounded-lg border px-3 py-1.5 ${panel ? 'border-primary text-primary' : 'border-line bg-white'}`} onClick={() => setPanel(!panel)}>Colonnes · {shown.length}</button>
      <button className="rounded-lg border border-line bg-white px-3 py-1.5" disabled={!shown.length || !data.total} onClick={() => window.print()}>Imprimer</button>
      {data.canEdit && (['xlsx', 'pdf', 'csv'] as const).map((f) => (
        <button key={f} className="rounded-lg border border-line bg-white px-3 py-1.5 disabled:opacity-50" disabled={!!busy || !shown.length || !data.total} onClick={() => exportAs(f)}>
          {busy === f ? '…' : f === 'xlsx' ? 'Excel' : f.toUpperCase()}</button>))}
    </div>

    {panel && <div className="card mt-3 print:hidden">
      <p className="text-xs text-muted">Cochez et ordonnez les colonnes : elles s'appliquent à l'écran, à l'impression et aux exports.{data.canEdit ? '' : " Lecture seule : l'enregistrement est réservé aux recruteurs."}</p>
      <ul className="mt-3 divide-y divide-line">{cols.map((c, i) => (
        <li key={c.key} className="flex items-center gap-2 py-1.5">
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={c.visible} onChange={() => toggle(i)} aria-label={`Afficher ${c.label}`} />
          <span className={`min-w-0 flex-1 truncate text-sm ${c.visible ? '' : 'text-muted'}`}>{c.label}</span>
          <button className="h-8 w-8 rounded-lg border border-line text-sm disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
          <button className="h-8 w-8 rounded-lg border border-line text-sm disabled:opacity-30" disabled={i === cols.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button></li>))}</ul>
      {data.canEdit && <div className="mt-3 flex items-center gap-3">
        <button className="btn !py-2.5 text-xs" disabled={!dirty || !shown.length || busy === 'save'} onClick={save}>{busy === 'save' ? 'Enregistrement…' : 'Enregistrer les colonnes'}</button>
        {dirty && <button className="text-xs text-muted" onClick={() => setCols(JSON.parse(saved.current))}>Annuler</button>}
        {msg && <span className="text-xs text-success" aria-live="polite">{msg}</span>}</div>}
    </div>}
    {err && <p className="mt-3 text-sm text-error">{err}</p>}

    {!data.rows.length ? <p className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">Aucun candidat retenu pour l'instant. Sélectionnez des candidatures puis « Retenir ».</p>
      : !shown.length ? <p className="mt-6 text-sm text-muted">Aucune colonne affichée.</p>
      : <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white print:overflow-visible print:rounded-none print:border-0">
        <table className="w-full min-w-max border-collapse text-left text-sm print:min-w-0 print:text-[9pt]">
          <thead className="bg-subtle text-xs uppercase tracking-wide text-muted print:table-header-group">
            <tr>{shown.map((c) => <th key={c.key} className="whitespace-nowrap border-b border-line px-3 py-2.5 font-semibold print:whitespace-normal">{c.label}</th>)}</tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 print:break-inside-avoid">
              {shown.map((c) => <td key={c.key} className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-2.5 align-top">
                {c.key === 'reference' ? <Link className="font-mono text-xs text-primary print:text-ink" href={`/app/recruitments/${id}/applications/${r.id}?org=${org}`}>{r.cells[c.key]}</Link> : r.cells[c.key] || '—'}</td>)}</tr>))}</tbody>
        </table></div>}
  </main>);
}

export default function Page() { return <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}><Selected /></Suspense>; }
