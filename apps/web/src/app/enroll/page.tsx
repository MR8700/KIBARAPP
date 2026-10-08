'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enroll } from '@/lib/passkey';
import { friendly } from '@/lib/friendly';
import Logo from '@/components/Logo';
import RecoveryCodes from '@/components/RecoveryCodes';
import { Icon } from '@/components/Icon';

export default function Enroll() {
  const r = useRouter();
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null); const [err, setErr] = useState('');
  const ok = name.trim().length >= 2;
  async function go() {
    if (!ok || busy) return; setBusy(true); setErr('');
    try { const s = await enroll(name.trim()); setCodes(s.recoveryCodes ?? []); } catch (e: any) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  if (codes) return (<main className="mx-auto max-w-md px-5 pb-10 pt-8">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Icon name="check_circle" className="text-[32px]" /></span>
    <h1 className="mt-4 font-head text-2xl font-bold">Votre espace est prêt !</h1>
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"><p className="font-bold">Dernière chose : gardez ces codes</p>
      <p className="mt-1">Si vous perdez ou changez de téléphone, ils sont le seul moyen de retrouver votre espace. Copiez-les ou téléchargez-les, puis conservez-les ailleurs (carnet, WhatsApp à vous-même…). Chaque code ne sert qu'une fois.</p></div>
    <div className="mt-5"><RecoveryCodes codes={codes} /></div>
    <label className="mt-5 flex min-h-[48px] items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-5 w-5" checked={saved} onChange={(e) => setSaved(e.target.checked)} />J'ai bien gardé mes codes de secours</label>
    <button className="btn mt-3 w-full !py-4 text-base" disabled={!saved} onClick={() => r.push('/app/dashboard')}>Entrer dans mon espace</button></main>);
  return (<main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-6">
    <Link href="/" aria-label="Retour à l'accueil" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700"><Icon name="arrow_back" className="text-[24px]" /></Link>
    <Logo size={40} className="mt-4" />
    <h1 className="mt-8 font-head text-2xl font-bold">Créons votre espace</h1>
    <p className="mt-2 text-base text-slate-600">Cela prend moins d'une minute.</p>
    <label className="mt-6 block"><span className="mb-2 block text-[15px] font-semibold">Comment vous appelez-vous ?</span>
      <input className="field-k" placeholder="Ex. Awa Ouédraogo" autoComplete="name" enterKeyHint="go" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
    <div className="mt-5 flex gap-3 rounded-2xl bg-blue-50 p-4 text-sm leading-relaxed text-slate-700"><Icon name="fingerprint" className="text-[26px] text-primary shrink-0" />
      <p><b>Pas de mot de passe.</b> À l'étape suivante, votre téléphone vous demandera votre empreinte, votre visage ou votre code d'écran : comme pour le déverrouiller.</p></div>
    {err && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
    <button className="btn mt-auto w-full !py-4 text-base" disabled={busy || !ok} onClick={go}>{busy ? 'Un instant…' : 'Continuer'}<Icon name="arrow_forward" className="text-[20px]" /></button></main>);
}

