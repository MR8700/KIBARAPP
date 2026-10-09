import Link from 'next/link';
import Icon from './Icon';

interface DashboardHeroProps {
  first: string;
  orgName?: string;
  canCreate: boolean;
}

export default function DashboardHero({ first, orgName = 'Mon Espace', canCreate }: DashboardHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-6 text-white shadow-xl shadow-blue-900/15">
      {/* Halos de lumière décoratifs */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 left-1/3 h-40 w-40 rounded-full bg-amber-400/20 blur-2xl" />
      <div className="pointer-events-none absolute right-4 bottom-2 h-32 w-32 rounded-full bg-blue-400/20 blur-xl" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        {/* Contenu gauche */}
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-md shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-xs" />
            </span>
            <span className="truncate max-w-[220px]">Espace {orgName} • Actif</span>
          </div>

          <h1 className="mt-3 font-head text-2xl md:text-3xl font-extrabold tracking-tight text-white">
            Bonjour {first ? first : ''} 👋
          </h1>
          <p className="mt-1 text-xs md:text-sm text-blue-100/90 leading-relaxed max-w-sm">
            Pilotez vos campagnes de recrutement et recevez des candidatures vérifiées sur votre téléphone.
          </p>

          {canCreate && (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Link
                href="/app/recruitments/new"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs md:text-sm font-bold text-blue-800 shadow-md shadow-black/10 hover:bg-blue-50 active:scale-95 transition no-underline"
                style={{ textDecoration: 'none' }}
              >
                <Icon name="add" size={18} className="text-blue-700" />
                <span>Créer un recrutement</span>
              </Link>
            </div>
          )}
        </div>

        {/* Illustration illustrative vectorielle droite */}
        <div className="relative flex shrink-0 items-center justify-center self-center md:self-auto">
          <svg
            width="140"
            height="130"
            viewBox="0 0 160 150"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-2xl select-none"
            aria-hidden="true"
          >
            {/* Carte candidate flottante */}
            <rect x="25" y="15" width="110" height="120" rx="20" fill="white" fillOpacity="0.95" />
            <rect x="25" y="15" width="110" height="120" rx="20" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />

            {/* Avatar candidat */}
            <circle cx="80" cy="48" r="22" fill="#DBEAFE" />
            <circle cx="80" cy="42" r="9" fill="#1D4ED8" />
            <path
              d="M66 62c0-7.732 6.268-14 14-14s14 6.268 14 14"
              fill="#1D4ED8"
            />

            {/* Badge de certification étoile */}
            <circle cx="97" cy="35" r="9" fill="#F59E0B" />
            <path
              d="M97 30.5l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z"
              fill="white"
            />

            {/* Lignes du dossier de candidature */}
            <rect x="42" y="78" width="76" height="6" rx="3" fill="#1E293B" />
            <rect x="48" y="90" width="64" height="4.5" rx="2.25" fill="#94A3B8" />

            {/* Badge de statut Retenu / Validé */}
            <rect x="52" y="102" width="56" height="18" rx="9" fill="#DCFCE7" />
            <path
              d="M74 111.5l2 2 5-5"
              stroke="#15803D"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="68" cy="111" r="3" fill="#15803D" />

            {/* Éléments décoratifs flottants */}
            <g className="animate-pulse">
              <circle cx="16" cy="35" r="5" fill="#FDE047" fillOpacity="0.9" />
              <circle cx="145" cy="85" r="6" fill="#60A5FA" fillOpacity="0.8" />
              <rect
                x="134"
                y="28"
                width="14"
                height="14"
                rx="4"
                transform="rotate(20 134 28)"
                fill="#38BDF8"
                fillOpacity="0.8"
              />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
