'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';
import { useRealtime } from '@/lib/realtime';
import { ASTATUS } from '@/lib/apps';
import BottomNav from '@/components/BottomNav';
import FluidBackground from '@/components/FluidBackground';

type S = {
  title: string;
  total: number;
  counts: Record<string, number>;
  selectedRate: number;
  perDay: { day: string; count: number }[];
  distributions: { key: string; label: string; items: { label: string; count: number }[] }[];
};

function Stats() {
  const { id } = useParams<{ id: string }>();
  const org = useSearchParams().get('org') ?? '';
  const [s, setS] = useState<S | null>(null);
  const [err, setErr] = useState('');
  const t = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(() => {
    authApi<S>(`/orgs/${org}/recruitments/${id}/stats`)
      .then(setS)
      .catch((e) => setErr(e.message));
  }, [org, id]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(
    org,
    (e) => {
      if (e.recruitmentId === id) {
        clearTimeout(t.current);
        t.current = setTimeout(load, 800);
      }
    },
    load
  );

  if (!s) {
    return (
      <main className="p-10 text-center text-sm text-slate-500">
        <span className="ms animate-spin text-[24px] text-blue-600 inline-block mb-2">sync</span>
        <p>{err || 'Chargement des statistiques…'}</p>
      </main>
    );
  }

  const max = Math.max(1, ...s.perDay.map((d) => d.count));

  return (
    <>
      <FluidBackground />
      <main className="relative z-10 mx-auto max-w-md px-5 pb-32 pt-6">
        <Link
          href={`/app/recruitments/${id}/applications?org=${org}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:border-slate-300 hover:text-blue-700 active:scale-95 transition"
        >
          <span className="ms text-[16px]">arrow_back</span>
          <span>Candidatures</span>
        </Link>

        <h1 className="mt-4 font-head text-2xl font-bold tracking-tight text-slate-900">
          Statistiques
        </h1>
        <p className="mt-1 break-words text-sm text-slate-500">{s.title}</p>

        <div className="card-k mt-5 grid grid-cols-2 divide-x divide-slate-100 text-center">
          <div className="py-1">
            <p className="font-head text-3xl font-extrabold text-slate-900">{s.total}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Candidatures
            </p>
          </div>
          <div className="py-1">
            <p className="font-head text-3xl font-extrabold text-blue-600">{s.selectedRate} %</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Retenus
            </p>
          </div>
        </div>

        <h2 className="mb-2.5 mt-7 text-sm font-bold uppercase tracking-wider text-slate-500">
          Par statut
        </h2>
        <div className="card-k space-y-3">
          {Object.entries(ASTATUS).map(([k, v]) => {
            const n = s.counts[k] ?? 0;
            const pct = s.total ? (n / s.total) * 100 : 0;
            return (
              <div key={k}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{v.label}</span>
                  <span className="font-bold text-slate-900">
                    {n} <span className="text-slate-400 font-normal">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <h2 className="mb-2.5 mt-7 text-sm font-bold uppercase tracking-wider text-slate-500">
          30 derniers jours
        </h2>
        <div className="card-k">
          <div
            className="flex h-28 items-end gap-[3px] pt-4"
            role="img"
            aria-label="Candidatures par jour sur 30 jours"
          >
            {s.perDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day} : ${d.count}`}
                className="flex-1 rounded-t bg-blue-600 hover:bg-blue-700 transition"
                style={{
                  height: `${Math.max(d.count ? 8 : 3, (d.count / max) * 100)}%`,
                  opacity: d.count ? 1 : 0.2,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10.5px] font-medium text-slate-400 border-t border-slate-100 pt-2">
            <span>{s.perDay[0]?.day.slice(5)}</span>
            <span className="font-bold text-blue-700">Pic : {max}/jour</span>
            <span>{s.perDay[s.perDay.length - 1]?.day.slice(5)}</span>
          </div>
        </div>

        {s.distributions.map((d) => {
          const m = Math.max(1, ...d.items.map((i) => i.count));
          return (
            <section key={d.key}>
              <h2 className="mb-2.5 mt-7 text-sm font-bold uppercase tracking-wider text-slate-500">
                {d.label}
              </h2>
              <div className="card-k space-y-3">
                {d.items.map((i) => (
                  <div key={i.label}>
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-medium text-slate-700">{i.label}</span>
                      <span className="font-bold text-slate-900">{i.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${(i.count / m) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <BottomNav
        variant="cand"
        active="stats"
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
      <Stats />
    </Suspense>
  );
}
