'use client';
import { useState } from 'react';
import Logo from '@/components/Logo';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { recover } from '@/lib/passkey';
import { friendly } from '@/lib/friendly';

export default function Recover() {
  const r = useRouter();
  const [code, setCode] = useState(''); const [revokeOthers, setRevokeOthers] = useState(true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ok = code.replace(/[^0-9a-z]/gi, '').length >= 20;
  async function go() {
    setBusy(true); setErr('');
    try { await recover(code, revokeOthers); r.push('/app/security?recovered=1'); }
    catch (e: any) { setErr(e.name === 'NotAllowedError' ? "Enregistrement annulé. Votre code n'a pas été utilisé : vous pouvez réessayer." : friendly(e)); setBusy(false); }
  }
  return (<main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
    <Logo size={44} className="mb-8" />
    <h1 className="font-head text-2xl font-bold">Retrouver mon espace</h1>
    <p className="mt-2 text-sm text-muted">Saisissez un de vos codes de secours pour enregistrer ce téléphone. Chaque code ne sert qu'une fois.</p>
    <input className="field-k mt-6 font-mono uppercase tracking-wider" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
    <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={revokeOthers} onChange={(e) => setRevokeOthers(e.target.checked)} />
      <span><span className="font-semibold">Déconnecter mes autres appareils</span><span className="block text-xs text-muted">Recommandé si votre appareil a été perdu ou volé.</span></span></label>
    {err && <p className="mt-3 text-sm text-error">{err}</p>}
    <button className="btn mt-5 w-full" disabled={busy || !ok} onClick={go}>{busy ? 'Vérification…' : 'Enregistrer ce téléphone'}</button>
    <Link href="/login" className="mt-4 text-center text-sm font-semibold text-primary">Retour à la connexion</Link>
  </main>);
}
