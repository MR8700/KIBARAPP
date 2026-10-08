'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type BottomNavActive = 'rec' | 'cand' | 'selected' | 'stats' | 'profil';

/** Barre de navigation basse moderne, sans aucun soulignement, avec indicateurs et mémorisation contextuelle. */
export default function BottomNav({
  active,
  candidaturesHref,
  selectedHref,
  statsHref,
  dot = false,
  variant = 'rec',
}: {
  active: BottomNavActive;
  candidaturesHref?: string;
  selectedHref?: string;
  statsHref?: string;
  dot?: boolean;
  variant?: 'rec' | 'cand';
}) {
  const [resolvedCandHref, setResolvedCandHref] = useState<string>(candidaturesHref || '/app/dashboard');
  const [resolvedSelectedHref, setResolvedSelectedHref] = useState<string>(selectedHref || '/app/dashboard');
  const [resolvedStatsHref, setResolvedStatsHref] = useState<string>(statsHref || '/app/dashboard');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (candidaturesHref && candidaturesHref !== '/app/dashboard') {
      sessionStorage.setItem('kibar.last_cand_href', candidaturesHref);
      setResolvedCandHref(candidaturesHref);
    } else {
      const saved = sessionStorage.getItem('kibar.last_cand_href');
      if (saved) setResolvedCandHref(saved);
    }

    if (selectedHref && selectedHref !== '/app/dashboard') {
      sessionStorage.setItem('kibar.last_selected_href', selectedHref);
      setResolvedSelectedHref(selectedHref);
    } else {
      const saved = sessionStorage.getItem('kibar.last_selected_href');
      if (saved) setResolvedSelectedHref(saved);
    }

    if (statsHref && statsHref !== '/app/dashboard') {
      sessionStorage.setItem('kibar.last_stats_href', statsHref);
      setResolvedStatsHref(statsHref);
    } else {
      const saved = sessionStorage.getItem('kibar.last_stats_href');
      if (saved) setResolvedStatsHref(saved);
    }
  }, [candidaturesHref, selectedHref, statsHref]);

  const item = (on: boolean) =>
    `relative flex flex-col items-center justify-center rounded-xl px-2.5 py-1.5 text-[11px] no-underline select-none transition-all duration-150 ${
      on
        ? 'font-bold text-blue-600 bg-blue-50/90 shadow-xs'
        : 'font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50/60'
    }`;

  const lbl = (on: boolean) =>
    `mt-0.5 text-[10.5px] leading-tight no-underline select-none ${
      on ? 'font-bold text-blue-700' : 'text-slate-500'
    }`;

  const linkStyle = { textDecoration: 'none' };

  if (variant === 'cand') {
    return (
      <nav
        className="fixed bottom-0 z-40 w-full border-t border-slate-200/80 bg-white/95 shadow-lg backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Navigation du recrutement"
      >
        <div className="mx-auto flex h-16 max-w-md items-center justify-around px-1.5">
          {([
            ['Postes', 'work', '/app/dashboard', active === 'rec', false],
            ['Candidats', 'groups', resolvedCandHref, active === 'cand', dot],
            ['Retenus', 'how_to_reg', resolvedSelectedHref, active === 'selected', false],
            ['Stats', 'bar_chart', resolvedStatsHref, active === 'stats', false],
            ['Compte', 'settings', '/app/security', active === 'profil', false],
          ] as const).map(([label, icon, href, isOn, hasDot]) => (
            <Link
              key={label}
              href={href}
              aria-current={isOn ? 'page' : undefined}
              className={item(isOn)}
              style={linkStyle}
            >
              <span className="relative flex items-center justify-center">
                <span className="ms text-[20px]">{icon}</span>
                {hasDot && (
                  <span className="absolute -right-1 top-0 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
                )}
              </span>
              <span className={lbl(isOn)}>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="fixed bottom-0 z-40 w-full border-t border-slate-200/80 bg-white/95 shadow-lg backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Navigation principale"
    >
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-3">
        <Link
          href="/app/dashboard"
          aria-current={active === 'rec' ? 'page' : undefined}
          className={item(active === 'rec')}
          style={linkStyle}
        >
          <span className="ms text-[22px]">deployed_code</span>
          <span className={lbl(active === 'rec')}>Recrutements</span>
        </Link>
        <Link
          href={resolvedCandHref}
          aria-current={active === 'cand' ? 'page' : undefined}
          className={item(active === 'cand')}
          style={linkStyle}
        >
          <span className="relative flex items-center justify-center">
            <span className="ms text-[22px]">groups</span>
            {dot && (
              <span className="absolute -right-1 top-0 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />
            )}
          </span>
          <span className={lbl(active === 'cand')}>Candidatures</span>
        </Link>
        <Link
          href="/app/security"
          aria-current={active === 'profil' ? 'page' : undefined}
          className={item(active === 'profil')}
          style={linkStyle}
        >
          <span className="ms text-[22px]">person</span>
          <span className={lbl(active === 'profil')}>Profil</span>
        </Link>
      </div>
    </nav>
  );
}
