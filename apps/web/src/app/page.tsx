'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo, { LogoMark } from '@/components/Logo';

const STEPS = [
  { i: 'edit_note', t: 'Décrivez le poste', d: 'Un titre et quelques lignes. Des modèles prêts à l\'emploi vous aident.' },
  { i: 'dynamic_form', t: 'Choisissez les questions', d: 'Nom, téléphone, CV… vous gardez ce qu\'il faut, rien de plus.' },
  { i: 'share', t: 'Partagez le lien', d: 'Envoyez-le sur WhatsApp. Les candidats postulent sans créer de compte.' },
];

/** Splash (1,4 s, une fois par session) puis : session existante → tableau de bord, sinon accueil. */
export default function Welcome() {
  const r = useRouter();
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const seen = sessionStorage.getItem('kibar.splash') === '1';
    const go = () => { sessionStorage.setItem('kibar.splash', '1'); if (localStorage.getItem('kibar.refresh')) r.replace('/app/dashboard'); else setSplash(false); };
    if (seen) go(); else { const t = setTimeout(go, 1400); return () => clearTimeout(t); }
  }, [r]);

  if (splash) return (<main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-white via-blue-50 to-blue-100 px-5" aria-busy="true">
    <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" aria-hidden />
    <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" aria-hidden />
    <LogoMark size={104} className="animate-[pop_.7s_ease-out] drop-shadow-xl" />
    <h1 className="mt-6 animate-[fadeup_.6s_ease-out_.25s_both] font-head text-3xl font-extrabold tracking-tight">KIBAR <span className="text-primary">APP</span></h1>
    <p className="mt-2 animate-[fadeup_.6s_ease-out_.45s_both] text-center text-sm text-muted">Recrutez simplement, depuis votre téléphone</p>
    <div className="absolute inset-x-8 bottom-12"><div className="h-1.5 overflow-hidden rounded-full bg-white/70"><div className="h-full w-full origin-left animate-[kibar-load_1.4s_ease-out] rounded-full bg-primary" /></div>
      <p className="mt-3 text-center text-xs text-muted">Chargement…</p></div>
  </main>);

  return (<main className="mx-auto flex min-h-dvh max-w-md animate-[fadeup_.5s_ease-out] flex-col px-5 pb-8 pt-6">
    <Logo size={36} />
    <h1 className="mt-9 font-head text-[34px] font-extrabold leading-[1.1] tracking-tight text-slate-900">Trouvez vos futurs collaborateurs, <span className="text-primary">simplement.</span></h1>
    <p className="mt-3 text-base leading-relaxed text-slate-600">Lancez un recrutement en quelques minutes. Pas besoin d'être à l'aise avec l'informatique : on vous guide pas à pas.</p>
    <ol className="mt-7 space-y-3">{STEPS.map((s, n) => (<li key={s.t} className="card-k flex items-start gap-3.5 !p-3.5">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary"><span className="ms text-[24px]">{s.i}</span>
        <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{n + 1}</span></span>
      <span><span className="block text-[15px] font-bold text-slate-900">{s.t}</span><span className="mt-0.5 block text-sm leading-snug text-slate-600">{s.d}</span></span></li>))}</ol>
    <div className="mt-auto flex flex-col gap-3 pt-8">
      <Link href="/enroll" className="btn !py-4 text-base">Créer mon espace gratuitement<span className="ms text-[20px]">arrow_forward</span></Link>
      <Link href="/login" className="flex min-h-[48px] items-center justify-center rounded-xl border border-slate-200 bg-white text-[15px] font-semibold text-primary">J'ai déjà un espace</Link>
      <Link href="/recover" className="py-2 text-center text-sm font-medium text-slate-500 hover:text-slate-800 transition">Téléphone perdu ou changé ?</Link>
      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><span className="ms text-[16px] text-emerald-600">lock</span>Aucun mot de passe à retenir : votre téléphone suffit</p></div>
  </main>);
}
