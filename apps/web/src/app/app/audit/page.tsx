'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';
import BottomNav from '@/components/BottomNav';
import FluidBackground from '@/components/FluidBackground';

type Item = { id: string; action: string; at: string; user: string; meta: Record<string, unknown> };

const LABELS: Record<string, string> = {
  'applications.export': 'Export CSV des candidatures',
  'selected.export': 'Export des retenus',
  'selected.config': 'Colonnes des retenus modifiées',
  'application.bulk_status': 'Changement de statut',
  'file.access': 'Accès à un document',
};

const FILTERS: [string, string][] = [
  ['', 'Tout'],
  ['application', 'Candidatures'],
  ['selected', 'Retenus'],
  ['file', 'Documents'],
];

function Audit() {
  const org = useSearchParams().get('org') ?? '';
  const [items, setItems] = useState<Item[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [err, setErr] = useState('');

  const fetchPage = useCallback(
    (before?: string) =>
      authApi<{ items: Item[]; next: string | null }>(
        `/orgs/${org}/audit?${new URLSearchParams({
          ...(before ? { before } : {}),
          ...(action ? { action } : {}),
        })}`
      ),
    [org, action]
  );

  useEffect(() => {
    setItems(null);
    fetchPage()
      .then((r) => {
        setItems(r.items);
        setNext(r.next);
      })
      .catch((e) => setErr(e.message));
  }, [fetchPage]);

  const more = () =>
    next &&
    fetchPage(next)
      .then((r) => {
        setItems((i) => [...(i ?? []), ...r.items]);
        setNext(r.next);
      })
      .catch((e) => setErr(e.message));

  const detail = (m: Record<string, unknown>) =>
    Object.entries(m)
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');

  return (
    <>
      <FluidBackground />
      <main className="relative z-10 mx-auto max-w-md px-5 pb-32 pt-6">
        <Link
          href="/app/dashboard"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:border-slate-300 hover:text-blue-700 active:scale-95 transition"
        >
          <span className="ms text-[16px]">arrow_back</span>
          <span>Recrutements</span>
        </Link>

        <h1 className="mt-4 font-head text-2xl font-bold tracking-tight text-slate-900">
          Journal d'audit
        </h1>

        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAction(k)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                action === k
                  ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                  : 'border-slate-200/80 bg-white/90 text-slate-600 hover:border-slate-300'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {err && (
          <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/90 p-4 text-xs font-medium text-red-800 shadow-xs">
            <span className="ms text-[20px] text-red-600 shrink-0">error</span>
            <span>{err}</span>
          </div>
        )}

        <ul className="mt-4 space-y-2.5">
          {!items ? (
            <li className="card-k text-center text-xs text-slate-500 py-6">
              <span className="ms animate-spin text-[20px] text-blue-600 inline-block mb-1">sync</span>
              <p>Chargement du journal…</p>
            </li>
          ) : !items.length ? (
            <li className="card-k p-8 text-center text-sm text-slate-500">
              Aucune entrée dans cette période
            </li>
          ) : (
            items.map((i) => (
              <li key={i.id} className="card-k">
                <p className="text-sm font-bold text-slate-900">{LABELS[i.action] ?? i.action}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {i.user} ·{' '}
                  {new Date(i.at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {detail(i.meta) && (
                  <p className="mt-1.5 break-words font-mono text-[11px] text-slate-500 bg-slate-50/80 rounded-lg p-2 border border-slate-100">
                    {detail(i.meta)}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>

        {next && (
          <button
            type="button"
            className="btn-secondary mt-4 w-full !py-2.5 text-xs font-bold"
            onClick={more}
          >
            Charger plus
          </button>
        )}
      </main>

      <BottomNav active="profil" />
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}>
      <Audit />
    </Suspense>
  );
}
