'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authApi, currentOrg, setCurrentOrg, STATUS } from '@/lib/session';
import Logo from '@/components/Logo';
import BottomNav from '@/components/BottomNav';
import NotificationBell from '@/components/NotificationBell';
import DashboardHero from '@/components/DashboardHero';
import Icon from '@/components/Icon';
import { freshLabel, useRealtime } from '@/lib/realtime';
import { getCached, setCached, onStateChange } from '@/lib/cache';

type Org = { id: string; name: string; role: string; userName?: string };
type Rec = {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  publicToken: string;
  _count: { applications: number };
  selectedCount?: number;
};

export default function Dashboard() {
  const [orgs, setOrgs] = useState<Org[] | null>(() => (typeof window !== 'undefined' ? getCached<Org[]>('orgs') : null));
  const [org, setOrg] = useState(() => (typeof window !== 'undefined' ? (currentOrg() || getCached<Org[]>('orgs')?.[0]?.id || '') : ''));
  const [recs, setRecs] = useState<Rec[] | null>(() => (typeof window !== 'undefined' && org ? getCached<Rec[]>(`recs_${org}`) : null));
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [toast, setToast] = useState('');
  const [tick, setTick] = useState(0);

  const recsRef = useRef<Rec[] | null>(null);
  recsRef.current = recs;
  const tt = useRef<ReturnType<typeof setTimeout>>();

  // Chargement des organisations avec cache SWR
  useEffect(() => {
    authApi<Org[]>('/orgs')
      .then((o) => {
        setOrgs(o);
        setCached('orgs', o);
        const cur = o.find((x) => x.id === currentOrg()) ?? o[0];
        if (cur) {
          setOrg(cur.id);
          setCurrentOrg(cur.id);
        }
      })
      .catch((e) => setErr(e.message));
  }, []);

  // Chargement des recrutements avec cache SWR instantané (pas de setRecs(null))
  const loadRecs = (orgId: string) => {
    if (!orgId) return;
    authApi<Rec[]>(`/orgs/${orgId}/recruitments`)
      .then((r) => {
        setRecs(r);
        setCached(`recs_${orgId}`, r);
      })
      .catch((e) => setErr(e.message));
  };

  useEffect(() => {
    if (!org) return;
    const cached = getCached<Rec[]>(`recs_${org}`);
    if (cached) setRecs(cached);
    loadRecs(org);
  }, [org]);

  // Écoute des événements locaux
  useEffect(() => {
    const unsub = onStateChange('recruitment.updated', () => {
      if (org) loadRecs(org);
    });
    return unsub;
  }, [org]);

  // Écoute temps réel via WebSocket
  useRealtime(
    org,
    (e) => {
      if (e.type !== 'application.new') return;
      setTick((t) => t + 1);
      const title = recsRef.current?.find((r) => r.id === e.recruitmentId)?.title;
      setRecs((rs) => {
        if (!rs) return rs;
        const updated = rs.map((r) =>
          r.id === e.recruitmentId
            ? { ...r, _count: { applications: r._count.applications + 1 } }
            : r
        );
        if (org) setCached(`recs_${org}`, updated);
        return updated;
      });
      setToast(`${freshLabel(1)}${title ? ` · ${title}` : ''}`);
      clearTimeout(tt.current);
      tt.current = setTimeout(() => setToast(''), 4000);
    },
    () => {
      if (org) loadRecs(org);
    }
  );

  async function createOrg() {
    try {
      const o = await authApi<Org>('/orgs', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      setOrgs([o]);
      setCached('orgs', [o]);
      setOrg(o.id);
      setCurrentOrg(o.id);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const link = (t: string) => `${location.origin}/r/${t}`;

  if (!orgs && !recs)
    return <main className="p-10 text-center text-sm text-muted">{err || 'Chargement…'}</main>;

  if (orgs && !orgs.length)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-10">
        <Logo size={36} />
        <h1 className="mt-8 font-head text-2xl font-bold tracking-tight">
          Dernière étape avant de commencer
        </h1>
        <p className="mt-2 text-base text-slate-600">
          Comment s'appelle votre entreprise ou votre organisation ? Elle apparaîtra sur vos offres.
        </p>
        <label className="mt-6 block">
          <span className="mb-2 block text-[15px] font-semibold">Nom de votre organisation</span>
          <input
            className="field-k"
            placeholder="Ex. Société Faso Services"
            autoFocus
            enterKeyHint="go"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && createOrg()}
          />
        </label>
        {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        <button
          className="btn mt-auto w-full !py-4 text-base"
          disabled={name.trim().length < 2}
          onClick={createOrg}
        >
          Continuer<span className="ms text-[20px]">arrow_forward</span>
        </button>
      </main>
    );

  const cur = orgs?.find((o) => o.id === org);
  const canCreate = cur?.role === 'ADMIN' || cur?.role === 'RECRUTEUR';
  const active = recs?.filter((r) => r.status === 'ACTIVE').length ?? 0;
  const total = recs?.reduce((n, r) => n + r._count.applications, 0) ?? 0;
  const kept = recs?.reduce((n, r) => n + (r.selectedCount ?? 0), 0) ?? 0;
  const first = (cur?.userName || '').trim().split(/\s+/)[0] || '';
  const withApps = recs?.find((r) => r._count.applications > 0);
  const candHref = withApps ? `/app/recruitments/${withApps.id}/applications?org=${org}` : '/app/dashboard';
  const day = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  const dot: Record<string, string> = { ACTIVE: 'bg-emerald-500', PREVIEW: 'bg-amber-500' };
  const txt: Record<string, string> = { ACTIVE: 'text-emerald-700 font-semibold' };

  return (
    <>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-3 z-[60] mx-auto w-fit max-w-[90vw] truncate rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md animate-[fadeup_.3s_ease-out]"
        >
          {toast}
        </div>
      )}

      {/* Header moderne avec glassmorphism */}
      <header
        className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <Logo size={32} />
          <div className="flex items-center gap-2">
            <NotificationBell tick={tick} />
            <Link
              href="/app/security"
              aria-label="Profil et sécurité"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-700 to-indigo-600 text-xs font-bold text-white shadow-sm ring-2 ring-white"
            >
              {(first || cur?.name || 'K').charAt(0).toUpperCase()}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-28 pt-16">
        <div className="pt-2">
          <DashboardHero first={first} orgName={cur?.name} canCreate={canCreate} />
        </div>

        {/* Métriques modernes épurées avec teintes délicates */}
        <div className="card-k my-3 grid grid-cols-3 divide-x divide-slate-100 p-3.5 text-center shadow-xs">
          {[
            [active, 'Actifs', 'text-slate-900', 'bg-blue-50/50'],
            [total, 'Candidats', 'text-slate-900', 'bg-indigo-50/40'],
            [kept, 'Retenus', 'text-blue-600 font-bold', 'bg-emerald-50/40'],
          ].map(([n, l, c, bg]) => (
            <div key={l as string} className={`flex min-w-0 flex-col items-center rounded-xl py-2 px-1 ${bg}`}>
              <span className={`font-head text-2xl font-bold leading-none tracking-tight ${c}`}>
                {n}
              </span>
              <span className="mt-1.5 w-full truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {l}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pb-3 pt-5">
          <h2 className="text-base font-bold tracking-tight text-slate-900">Mes recrutements</h2>
          {cur?.role === 'ADMIN' ? (
            <Link
              href={`/app/audit?org=${org}`}
              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <span>Filtrer</span>
              <Icon name="tune" size={14} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
              <span>Filtrer</span>
              <Icon name="tune" size={14} />
            </span>
          )}
        </div>

        {err && <p className="mb-3 text-sm text-error">{err}</p>}

        {!recs ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : !recs.length ? (
          <div className="card-k flex flex-col items-center !p-7 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 shadow-xs">
              <span className="ms text-[34px]">rocket_launch</span>
            </span>
            <p className="mt-4 font-head text-lg font-bold text-slate-900">
              Lancez votre premier recrutement
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              C'est rapide : vous choisissez un modèle, vous partagez le lien, et les candidatures arrivent ici.
            </p>
            {canCreate && (
              <Link href="/app/recruitments/new" className="btn mt-5 w-full !py-3.5 text-base">
                Créer mon premier recrutement
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recs.map((r) => {
              const s = STATUS[r.status] || { label: r.status, cls: 'bg-slate-100 text-slate-600' };
              const isDraft = r.status === 'DRAFT' || r.status === 'PREVIEW';
              const open = isDraft
                ? `/app/recruitments/${r.id}/builder?org=${org}`
                : `/app/recruitments/${r.id}/applications?org=${org}`;

              if (isDraft)
                return (
                  <div key={r.id} className="card-k !border-dashed !bg-white/80">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-base font-semibold tracking-tight text-slate-800">
                          {r.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {s.label} • Étape {r.status === 'PREVIEW' ? '3' : '2'}/3
                        </p>
                      </div>
                      <Link
                        href={open}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 active:scale-95 transition no-underline"
                        style={{ textDecoration: 'none' }}
                      >
                        <span>Reprendre</span>
                        <Icon name="arrow_forward" size={14} />
                      </Link>
                    </div>
                  </div>
                );

              const dateLabel =
                r.startsAt && r.endsAt
                  ? `Du ${day(r.startsAt)} au ${day(r.endsAt)}`
                  : r.endsAt
                  ? `Fin le ${day(r.endsAt)}`
                  : r.startsAt
                  ? `Dès le ${day(r.startsAt)}`
                  : null;

              return (
                <div key={r.id} className="card-k">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-bold tracking-tight text-slate-900">
                        {r.title}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className={`inline-flex shrink-0 items-center gap-1.5 ${txt[r.status] ?? ''}`}>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${dot[r.status] ?? 'bg-slate-400'}`} />
                          {s.label}
                        </span>
                        {dateLabel && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-slate-600">
                              <Icon name="calendar_today" size={13} className="text-blue-600" />
                              <span>{dateLabel}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Link
                      href={open}
                      aria-label={`Ouvrir ${r.title}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition no-underline"
                      style={{ textDecoration: 'none' }}
                    >
                      <Icon name="arrow_forward" size={18} />
                    </Link>
                  </div>

                  <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3">
                    <Link href={open} className="flex min-w-0 items-baseline gap-1.5 hover:text-blue-700 no-underline" style={{ textDecoration: 'none' }}>
                      <span className="font-head text-xl font-extrabold text-slate-900">
                        {r._count.applications}
                      </span>
                      <span className="truncate text-xs font-medium text-slate-500">Candidatures</span>
                    </Link>
                    <Link
                      href={`/app/recruitments/${r.id}/selected?org=${org}`}
                      className="flex min-w-0 items-baseline gap-1.5 hover:text-blue-700 no-underline"
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="font-head text-xl font-extrabold text-blue-700">
                        {r.selectedCount ?? 0}
                      </span>
                      <span className="truncate text-xs font-medium text-slate-500">Retenus</span>
                    </Link>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs font-semibold border-t border-slate-50 pt-2.5">
                    {r._count.applications > 0 ? (
                      <Link
                        className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 no-underline"
                        href={`/app/recruitments/${r.id}/stats?org=${org}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <Icon name="bar_chart" size={15} className="text-blue-600" />
                        <span>Statistiques</span>
                      </Link>
                    ) : (
                      <span />
                    )}

                    {r.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-800 no-underline"
                        style={{ textDecoration: 'none' }}
                        onClick={() => {
                          navigator.clipboard.writeText(link(r.publicToken));
                          setCopied(r.id);
                          setTimeout(() => setCopied(''), 1800);
                        }}
                      >
                        <Icon name={copied === r.id ? 'check' : 'content_copy'} size={14} />
                        <span>{copied === r.id ? 'Lien copié ✓' : 'Partager le lien'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <BottomNav
        active="rec"
        candidaturesHref={candHref}
        dot={recs?.some((r) => r._count.applications > 0) ?? false}
      />
    </>
  );
}
