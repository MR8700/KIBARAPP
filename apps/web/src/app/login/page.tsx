'use client';
import { useState } from 'react';
import Logo from '@/components/Logo';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/passkey';
import { friendly } from '@/lib/friendly';

export default function Login() {
  const r = useRouter(); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go() { setBusy(true); setErr(''); try { await login(); r.push('/app/dashboard'); } catch (e: any) { setErr(friendly(e)); setBusy(false); } }
  return (<main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-6">
    <Link href="/" aria-label="Retour à l'accueil" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700"><span className="ms text-[24px]">arrow_back</span></Link>
    <div className="my-auto text-center">
      <Logo size={40} className="mb-8 justify-center" />
      <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-blue-50 text-primary"><span className="ms text-[52px]">fingerprint</span></span>
      <h1 className="mt-6 font-head text-2xl font-bold">Bon retour !</h1>
      <p className="mt-2 text-base leading-relaxed text-slate-600">Appuyez sur le bouton, puis confirmez avec <b>votre empreinte</b>, <b>votre visage</b> ou <b>le code de votre téléphone</b>.</p>
      {err && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-left text-sm text-red-700">{err}</p>}
      <button className="btn mt-6 w-full !py-4 text-base" disabled={busy} onClick={go}>{busy ? 'Vérification…' : 'Ouvrir mon espace'}</button>
      <Link href="/recover" className="mt-5 inline-block py-2 text-sm font-semibold text-primary">Téléphone perdu ? Utiliser un code de secours</Link></div></main>);
}
