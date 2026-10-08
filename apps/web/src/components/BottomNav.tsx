import Link from 'next/link';
/** Barre de navigation basse (maquette dashboard_recruteur_recruitflow). */
export default function BottomNav({ active, candidaturesHref, dot = false, variant = 'rec', statsHref = '/app/dashboard' }: { active: 'rec' | 'cand' | 'profil'; candidaturesHref: string; dot?: boolean; variant?: 'rec' | 'cand'; statsHref?: string }) {
  const item = (on: boolean) => `relative flex flex-col items-center justify-center px-3 py-1 text-[11px] ${on ? 'font-semibold text-blue-600' : 'font-medium text-slate-400'}`;
  const lbl = (on: boolean) => `mt-0.5 ${on ? 'underline underline-offset-2' : 'underline decoration-slate-300 underline-offset-2'}`;
  if (variant === 'cand') return (<nav className="fixed bottom-0 z-40 w-full border-t border-slate-100 bg-white/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
    <div className="mx-auto flex h-14 max-w-md items-center justify-around px-2">
      {([['Postes', 'work', '/app/dashboard', false, false], ['Candidats', 'groups', candidaturesHref, true, dot], ['Rapports', 'bar_chart', statsHref, false, false], ['Compte', 'settings', '/app/security', false, false]] as [string, string, string, boolean, boolean][]).map(([l, ic, h, on, d]) => (
        <Link key={l} href={h} aria-current={on ? 'page' : undefined} className={item(on)}><span className="relative"><span className="ms text-[22px]">{ic}</span>{d && <span className="absolute -right-1 top-0 h-1.5 w-1.5 rounded-full bg-blue-600" />}</span><span className={lbl(on)}>{l}</span></Link>))}
    </div></nav>);
  return (<nav className="fixed bottom-0 z-40 w-full border-t border-slate-100 bg-white/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
    <div className="mx-auto flex h-14 max-w-md items-center justify-around px-4">
      <Link href="/app/dashboard" aria-current={active === 'rec' ? 'page' : undefined} className={item(active === 'rec')}><span className="ms text-[22px]">deployed_code</span><span className={lbl(active === 'rec')}>Recrutements</span></Link>
      <Link href={candidaturesHref} aria-current={active === 'cand' ? 'page' : undefined} className={item(active === 'cand')}><span className="relative"><span className="ms text-[22px]">groups</span>{dot && <span className="absolute -right-1 top-0 h-1.5 w-1.5 rounded-full bg-blue-600" />}</span><span className={lbl(active === 'cand')}>Candidatures</span></Link>
      <Link href="/app/security" aria-current={active === 'profil' ? 'page' : undefined} className={item(active === 'profil')}><span className="ms text-[22px]">person</span><span className={lbl(active === 'profil')}>Profil</span></Link>
    </div></nav>);
}
