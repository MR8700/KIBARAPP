'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { authApi, authDownload } from '@/lib/session';
import { useRealtime } from '@/lib/realtime';
import BottomNav from '@/components/BottomNav';
import FluidBackground from '@/components/FluidBackground';

type Col = { key: string; label: string; visible: boolean };
type Row = { id: string; reference: string; cells: Record<string, string> };
type View = { title: string; canEdit: boolean; total: number; truncated: boolean; columns: Col[]; rows: Row[] };

function Selected() {
  const { id } = useParams<{ id: string }>();
  const org = useSearchParams().get('org') ?? '';
  const base = `/orgs/${org}/recruitments/${id}/selected`;
  const [data, setData] = useState<View | null>(null);
  const [cols, setCols] = useState<Col[] | null>(null);
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const saved = useRef('');
  const t = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(
    () =>
      authApi<View>(base)
        .then((r) => {
          const prev = saved.current;
          saved.current = JSON.stringify(r.columns);
          setData(r);
          setCols((p) => (!p || JSON.stringify(p) === prev ? r.columns : p));
        })
        .catch((e) => setErr(e.message)),
    [base]
  );

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(
    org,
    (e) => {
      if (e.type === 'application.status' && e.recruitmentId === id) {
        clearTimeout(t.current);
        t.current = setTimeout(load, 500);
      }
    },
    load
  );

  if (!data || !cols) {
    return (
      <main className="p-10 text-center text-sm text-slate-500">
        <span className="ms animate-spin text-[24px] text-blue-600 inline-block mb-2">sync</span>
        <p>{err || 'Chargement des retenus…'}</p>
      </main>
    );
  }

  const shown = cols.filter((c) => c.visible);
  const dirty = JSON.stringify(cols) !== saved.current;
  const move = (i: number, d: -1 | 1) =>
    setCols((c) => {
      const n = [...c!];
      const j = i + d;
      if (j < 0 || j >= n.length) return n;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const toggle = (i: number) =>
    setCols((c) => c!.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)));

  async function save() {
    setBusy('save');
    setErr('');
    setMsg('');
    try {
      const r = await authApi<{ columns: Col[] }>(`${base}/config`, {
        method: 'PUT',
        body: JSON.stringify({ columns: cols!.map(({ key, visible }) => ({ key, visible })) }),
      });
      saved.current = JSON.stringify(r.columns);
      setCols(r.columns);
      setMsg('Colonnes enregistrées');
      setTimeout(() => setMsg(''), 2500);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function exportAs(format: 'xlsx' | 'pdf' | 'csv') {
    setBusy(format);
    setErr('');
    try {
      await authDownload(
        `${base}/export?${new URLSearchParams({ format, columns: shown.map((c) => c.key).join(',') })}`,
        `retenus-${new Date().toISOString().slice(0, 10)}.${format}`
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="print:hidden">
        <FluidBackground />
      </div>
      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-32 pt-6 print:max-w-none print:p-0">
        <Link
          href={`/app/recruitments/${id}/applications?org=${org}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:border-slate-300 hover:text-blue-700 active:scale-95 transition print:hidden"
        >
          <span className="ms text-[16px]">arrow_back</span>
          <span>Candidatures</span>
        </Link>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words font-head text-2xl font-bold tracking-tight text-slate-900">
              Candidats retenus
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {data.title} · {data.total} candidat{data.total > 1 ? 's' : ''} retenu
              {data.total > 1 ? 's' : ''}
              <span className="hidden print:inline"> · {today}</span>
            </p>
          </div>
        </div>

        {data.truncated && (
          <p className="mt-2 text-xs text-amber-600 print:hidden">
            Affichage limité aux 5000 plus récents.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold print:hidden">
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 transition ${
              panel
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200/80 bg-white/90 text-slate-700 hover:border-slate-300'
            }`}
            onClick={() => setPanel(!panel)}
          >
            Colonnes · {shown.length}
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-slate-700 hover:border-slate-300 transition"
            disabled={!shown.length || !data.total}
            onClick={() => window.print()}
          >
            Imprimer
          </button>
          {data.canEdit &&
            (['xlsx', 'pdf', 'csv'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-slate-700 hover:border-slate-300 disabled:opacity-50 transition"
                disabled={!!busy || !shown.length || !data.total}
                onClick={() => exportAs(f)}
              >
                {busy === f ? '…' : f === 'xlsx' ? 'Excel' : f.toUpperCase()}
              </button>
            ))}
        </div>

        {panel && (
          <div className="card-k mt-4 print:hidden">
            <p className="text-xs text-slate-500">
              Cochez et ordonnez les colonnes : elles s'appliquent à l'écran, à l'impression et aux
              exports.
              {data.canEdit ? '' : " Lecture seule : l'enregistrement est réservé aux recruteurs."}
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {cols.map((c, i) => (
                <li key={c.key} className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded text-blue-600 focus:ring-blue-500"
                    checked={c.visible}
                    onChange={() => toggle(i)}
                    aria-label={`Afficher ${c.label}`}
                  />
                  <span className={`min-w-0 flex-1 truncate text-sm ${c.visible ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
                    {c.label}
                  </span>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    disabled={i === cols.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Descendre"
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ul>
            {data.canEdit && (
              <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  className="btn !py-2 !px-4 text-xs font-bold"
                  disabled={!dirty || !shown.length || busy === 'save'}
                  onClick={save}
                >
                  {busy === 'save' ? 'Enregistrement…' : 'Enregistrer les colonnes'}
                </button>
                {dirty && (
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    onClick={() => setCols(JSON.parse(saved.current))}
                  >
                    Annuler
                  </button>
                )}
                {msg && <span className="text-xs font-semibold text-emerald-600" aria-live="polite">{msg}</span>}
              </div>
            )}
          </div>
        )}

        {err && (
          <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/90 p-4 text-xs font-medium text-red-800 shadow-xs">
            <span className="ms text-[20px] text-red-600 shrink-0">error</span>
            <span>{err}</span>
          </div>
        )}

        {!data.rows.length ? (
          <div className="card-k mt-6 p-8 text-center text-sm text-slate-500">
            Aucun candidat retenu pour l'instant. Rendez-vous sur les candidatures et cliquez sur « Retenir ».
          </div>
        ) : !shown.length ? (
          <div className="card-k mt-6 p-8 text-center text-sm text-slate-500">
            Aucune colonne sélectionnée à afficher.
          </div>
        ) : (
          <div className="card-k mt-4 !p-0 overflow-x-auto print:overflow-visible print:rounded-none print:border-0">
            <table className="w-full min-w-max border-collapse text-left text-sm print:min-w-0 print:text-[9pt]">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 print:table-header-group">
                <tr>
                  {shown.map((c) => (
                    <th key={c.key} className="whitespace-nowrap border-b border-slate-200/80 px-4 py-3 font-bold print:whitespace-normal">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition print:break-inside-avoid">
                    {shown.map((c) => (
                      <td key={c.key} className="max-w-[260px] whitespace-pre-wrap break-words px-4 py-3 align-top">
                        {c.key === 'reference' ? (
                          <Link
                            className="font-mono text-xs font-bold text-blue-700 hover:text-blue-800"
                            href={`/app/recruitments/${id}/applications/${r.id}?org=${org}`}
                          >
                            {r.cells[c.key]}
                          </Link>
                        ) : (
                          r.cells[c.key] || '—'
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <div className="print:hidden">
        <BottomNav
          variant="cand"
          active="selected"
          candidaturesHref={`/app/recruitments/${id}/applications?org=${org}`}
          selectedHref={`/app/recruitments/${id}/selected?org=${org}`}
          statsHref={`/app/recruitments/${id}/stats?org=${org}`}
        />
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}>
      <Selected />
    </Suspense>
  );
}
