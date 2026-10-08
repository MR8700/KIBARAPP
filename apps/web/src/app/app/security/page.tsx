'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';
import { addDevice, logout, sensitive } from '@/lib/passkey';
import RecoveryCodes from '@/components/RecoveryCodes';

type Device = { id: string; name: string; platform: string; lastSeenAt: string | null; current: boolean };

function Security() {
  const r = useRouter(); const recovered = useSearchParams().get('recovered') === '1';
  const [devices, setDevices] = useState<Device[] | null>(null); const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(() => authApi<Device[]>('/auth/devices').then(setDevices).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function revoke(d: Device) {
    if (!confirm(`Révoquer « ${d.name} » ? Cet appareil sera déconnecté et ne pourra plus se reconnecter.`)) return;
    setBusy(d.id); setErr('');
    try { await sensitive(`/auth/devices/${d.id}`, { method: 'DELETE' }); await load(); } catch (e: any) { setErr(msg(e)); } finally { setBusy(''); }
  }
  async function regenerate() {
    if (!confirm('Générer de nouveaux codes de secours ? Les anciens (même non utilisés) cesseront de fonctionner.')) return;
    setBusy('codes'); setErr('');
    try { setCodes((await sensitive<{ codes: string[] }>('/auth/recovery-codes', { method: 'POST' })).codes); } catch (e: any) { setErr(msg(e)); } finally { setBusy(''); }
  }
  const msg = (e: any) => (e?.name === 'NotAllowedError' ? 'Confirmation annulée. Rien n\'a été modifié.' : e.message);
  async function add() {
    setBusy('add'); setErr('');
    try { await addDevice(); await load(); } catch (e: any) { setErr(msg(e)); } finally { setBusy(''); }
  }
  async function out() { await logout(); r.push('/login'); }

  return (<main className="mx-auto max-w-md px-5 pb-16 pt-6">
    <Link href="/app/dashboard" className="text-sm text-muted">← Recrutements</Link>
    <h1 className="mt-3 font-head text-2xl font-bold">Sécurité</h1>
    {recovered && <p role="status" className="mt-3 rounded-xl bg-success/10 px-4 py-3 text-sm text-success">Cet appareil est enregistré. Pensez à générer de nouveaux codes de secours.</p>}
    {err && <p className="mt-3 text-sm text-error">{err}</p>}

    <h2 className="mb-3 mt-7 text-base font-bold">Mes appareils</h2>
    <ul className="space-y-2">{!devices ? <li className="text-sm text-muted">Chargement…</li> : devices.map((d) => (
      <li key={d.id} className="card flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{d.name}{d.current && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Cet appareil</span>}</p>
          <p className="mt-0.5 text-xs text-muted">{d.platform} · {d.lastSeenAt ? `vu le ${new Date(d.lastSeenAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'jamais vu'}</p></div>
        {!d.current && <button className="shrink-0 text-xs font-semibold text-error disabled:opacity-50" disabled={busy === d.id} onClick={() => revoke(d)}>Révoquer</button>}
      </li>))}</ul>

    <button className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold" disabled={busy === 'add'} onClick={add}><span className="ms text-[18px]">add_circle</span>{busy === 'add' ? 'Ajout…' : 'Ajouter un appareil'}</button>
    <p className="mt-1 text-xs text-muted">Confirmez avec votre empreinte, votre visage ou votre code ; le navigateur peut proposer d'utiliser un autre téléphone (QR code).</p>

    <h2 className="mb-1 mt-8 text-base font-bold">Codes de secours</h2>
    <p className="mb-3 text-xs text-muted">Ils permettent de retrouver l'accès si vous perdez votre appareil. Chaque code ne sert qu'une fois et n'est affiché qu'à la création.</p>
    {codes ? <RecoveryCodes codes={codes} /> : <button className="btn w-full" disabled={busy === 'codes'} onClick={regenerate}>{busy === 'codes' ? 'Génération…' : 'Générer de nouveaux codes'}</button>}

    <button className="mt-10 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold" onClick={out}>Se déconnecter de cet appareil</button>
  </main>);
}
export default function Page() { return <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}><Security /></Suspense>; }
