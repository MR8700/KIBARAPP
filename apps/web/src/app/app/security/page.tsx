'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';
import { addDevice, logout, sensitive } from '@/lib/passkey';
import RecoveryCodes from '@/components/RecoveryCodes';
import BottomNav from '@/components/BottomNav';
import FluidBackground from '@/components/FluidBackground';

type Device = { id: string; name: string; platform: string; lastSeenAt: string | null; current: boolean };

function Security() {
  const r = useRouter();
  const recovered = useSearchParams().get('recovered') === '1';
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    return authApi<Device[]>('/auth/devices')
      .then(setDevices)
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(d: Device) {
    if (!confirm(`Révoquer « ${d.name} » ? Cet appareil sera déconnecté et ne pourra plus se reconnecter.`)) return;
    setBusy(d.id);
    setErr('');
    try {
      await sensitive(`/auth/devices/${d.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setErr(msg(e));
    } finally {
      setBusy('');
    }
  }

  async function regenerate() {
    if (!confirm('Générer de nouveaux codes de secours ? Les anciens (même non utilisés) cesseront de fonctionner.')) return;
    setBusy('codes');
    setErr('');
    try {
      const res = await sensitive<{ codes: string[] }>('/auth/recovery-codes', { method: 'POST' });
      setCodes(res.codes);
    } catch (e: any) {
      setErr(msg(e));
    } finally {
      setBusy('');
    }
  }

  const msg = (e: any) =>
    e?.name === 'NotAllowedError' ? "Confirmation annulée. Rien n'a été modifié." : e.message;

  async function add() {
    setBusy('add');
    setErr('');
    try {
      await addDevice();
      await load();
    } catch (e: any) {
      setErr(msg(e));
    } finally {
      setBusy('');
    }
  }

  async function out() {
    await logout();
    r.push('/login');
  }

  return (
    <>
      <FluidBackground />
      <main className="relative z-10 mx-auto max-w-md px-5 pb-32 pt-6">
        <Link
          href="/app/dashboard"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:border-slate-300 hover:text-blue-700 active:scale-95 transition"
        >
          <span className="ms text-[16px]">arrow_back</span>
          <span>Recrutements</span>
        </Link>

        <h1 className="mt-4 font-head text-2xl font-bold tracking-tight text-slate-900">
          Sécurité & Appareils
        </h1>

        {recovered && (
          <div
            role="status"
            className="mt-3 flex items-start gap-2.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4 text-xs font-medium text-emerald-800 shadow-xs"
          >
            <span className="ms text-[20px] text-emerald-600 shrink-0">check_circle</span>
            <span>Cet appareil est enregistré. Pensez à générer de nouveaux codes de secours.</span>
          </div>
        )}

        {err && (
          <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/90 p-4 text-xs font-medium text-red-800 shadow-xs">
            <span className="ms text-[20px] text-red-600 shrink-0">error</span>
            <span>{err}</span>
          </div>
        )}

        <h2 className="mb-3 mt-7 text-sm font-bold uppercase tracking-wider text-slate-500">
          Mes appareils
        </h2>

        <ul className="space-y-2.5">
          {!devices ? (
            <li className="card-k text-center text-xs text-slate-500 py-6">
              <span className="ms animate-spin text-[20px] text-blue-600 inline-block mb-1">sync</span>
              <p>Chargement des appareils…</p>
            </li>
          ) : (
            devices.map((d) => (
              <li key={d.id} className="card-k flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="ms text-[18px] text-blue-600 shrink-0">
                      {d.platform.toLowerCase().includes('mac') || d.platform.toLowerCase().includes('ios')
                        ? 'phone_iphone'
                        : 'computer'}
                    </span>
                    <span className="truncate">{d.name}</span>
                    {d.current && (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 shrink-0">
                        Cet appareil
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 pl-6">
                    {d.platform} · {d.lastSeenAt ? `vu le ${new Date(d.lastSeenAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'jamais vu'}
                  </p>
                </div>
                {!d.current && (
                  <button
                    type="button"
                    className="shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 active:scale-95 disabled:opacity-50 transition"
                    disabled={busy === d.id}
                    onClick={() => revoke(d)}
                  >
                    Révoquer
                  </button>
                )}
              </li>
            ))
          )}
        </ul>

        <button
          type="button"
          className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-xs hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] transition"
          disabled={busy === 'add'}
          onClick={add}
        >
          <span className="ms text-[18px] text-blue-600">add_circle</span>
          {busy === 'add' ? 'Ajout en cours…' : 'Ajouter un appareil'}
        </button>
        <p className="mt-2 text-[11.5px] text-slate-500 leading-relaxed px-1">
          Confirmez avec votre empreinte, votre visage ou votre code ; le navigateur peut proposer d'utiliser un autre téléphone (QR code).
        </p>

        <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wider text-slate-500">
          Codes de secours
        </h2>
        <p className="mb-3 text-xs text-slate-500 leading-relaxed">
          Ils permettent de retrouver l'accès si vous perdez votre appareil. Chaque code ne sert qu'une fois et n'est affiché qu'à la création.
        </p>
        {codes ? (
          <RecoveryCodes codes={codes} />
        ) : (
          <button
            type="button"
            className="btn w-full"
            disabled={busy === 'codes'}
            onClick={regenerate}
          >
            {busy === 'codes' ? 'Génération…' : 'Générer de nouveaux codes'}
          </button>
        )}

        <button
          type="button"
          className="mt-8 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-red-200/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-red-600 shadow-xs hover:bg-red-50 active:scale-[0.98] transition"
          onClick={out}
        >
          <span className="ms text-[18px]">logout</span>
          Se déconnecter de cet appareil
        </button>
      </main>

      <BottomNav active="profil" />
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}>
      <Security />
    </Suspense>
  );
}
