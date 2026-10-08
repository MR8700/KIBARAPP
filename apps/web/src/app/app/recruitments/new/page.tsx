'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authApi, currentOrg } from '@/lib/session';
import { friendly } from '@/lib/friendly';
import { TEMPLATES } from '@/lib/templates';
import Stepper from '@/components/Stepper';
import { invalidateCache } from '@/lib/cache';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(Date.now() + n * 864e5));

export default function NewRecruitment() {
  const r = useRouter();
  const today = iso(new Date());
  const [f, setF] = useState({
    title: '',
    description: '',
    startsAt: today,
    endsAt: '',
  });
  const [tpl, setTpl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ok = f.title.trim().length >= 3;

  function pick(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    setTpl(id);
    setF((p) => ({
      ...p,
      title: p.title.trim() ? p.title : t.title,
      description: p.description.trim() ? p.description : t.description,
    }));
  }

  async function go() {
    setBusy(true);
    setErr('');
    const body: Record<string, string> = { title: f.title.trim() };
    if (f.description.trim()) body.description = f.description.trim();
    if (f.startsAt) body.startsAt = new Date(f.startsAt).toISOString();
    if (f.endsAt) body.endsAt = new Date(f.endsAt + 'T23:59:59').toISOString();

    try {
      const org = currentOrg();
      const rec = await authApi<{ id: string }>(`/orgs/${org}/recruitments`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      invalidateCache(`recs_${org}`);
      if (tpl) sessionStorage.setItem(`kibar.tpl.${rec.id}`, tpl);
      r.push(`/app/recruitments/${rec.id}/builder?org=${org}`);
    } catch (e: any) {
      setErr(friendly(e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-4">
      <button
        className="flex h-11 items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
        onClick={() => r.back()}
      >
        <span className="ms text-[20px]">arrow_back</span>Retour
      </button>

      <div className="mt-2">
        <Stepper step={1} />
      </div>

      <h1 className="mt-5 font-head text-2xl font-extrabold tracking-tight text-slate-900">
        Quel poste voulez-vous pourvoir ?
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Choisissez un modèle pour gagner du temps. Vous pourrez tout modifier ensuite.
      </p>

      {/* Choix des modèles */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {TEMPLATES.map((t) => {
          const on = tpl === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              aria-pressed={on}
              className={`flex min-h-[96px] flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                on
                  ? 'border-blue-600 bg-blue-50/80 shadow-xs'
                  : 'border-slate-200/80 bg-white/90 hover:border-slate-300'
              }`}
            >
              <span className={`ms text-[26px] ${on ? 'text-blue-600' : 'text-slate-500'}`}>
                {on ? 'check_circle' : t.icon}
              </span>
              <span className="text-sm font-bold leading-tight text-slate-900">{t.name}</span>
              <span className="text-xs leading-tight text-slate-500">{t.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 space-y-6">
        <label className="block">
          <span className="mb-2 block text-[15px] font-semibold text-slate-900">
            Titre de l'offre <span className="text-red-600">*</span>
          </span>
          <input
            className="field-k"
            placeholder="Ex. 20 agents commerciaux"
            enterKeyHint="next"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
          <span className="mt-1 block text-xs text-slate-500">
            C'est ce que verront les candidats en premier.
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-[15px] font-semibold text-slate-900">
            Présentation du poste
          </span>
          <textarea
            className="field-k"
            rows={4}
            placeholder="Qui cherchez-vous ? Quelles missions ? Où ? (quelques lignes suffisent)"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </label>

        {/* Configuration des dates d'ouverture et de clôture */}
        <div className="card-k !p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="ms text-[20px] text-blue-600">event_available</span>
              <span className="font-head text-sm font-bold text-slate-900">
                Période de réception des candidatures
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Définissez la date de début et la date limite visibles par les candidats.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Date de début des candidatures
            </label>
            <input
              className="field-k"
              type="date"
              aria-label="Date de début"
              value={f.startsAt}
              onChange={(e) => setF({ ...f, startsAt: e.target.value })}
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Les candidats pourront postuler à partir de cette date.
            </span>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Date limite de réception <span className="font-normal text-slate-500">(facultatif)</span>
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                ['7 jours', 7],
                ['15 jours', 15],
                ['1 mois', 30],
              ].map(([l, n]) => {
                const v = inDays(n as number);
                return (
                  <button
                    key={l as string}
                    type="button"
                    onClick={() => setF({ ...f, endsAt: f.endsAt === v ? '' : v })}
                    aria-pressed={f.endsAt === v}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      f.endsAt === v
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <input
              className="field-k"
              type="date"
              min={f.startsAt || today}
              aria-label="Date de clôture"
              value={f.endsAt}
              onChange={(e) => setF({ ...f, endsAt: e.target.value })}
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Après cette date, les dépôts seront automatiquement clos.
            </span>
          </div>
        </div>
      </div>

      {err && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {err}
        </p>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-5 pt-3 backdrop-blur-md"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button
          className="btn mx-auto flex w-full max-w-md !py-3.5 text-base"
          disabled={busy || !ok}
          onClick={go}
        >
          {busy ? 'Création…' : 'Continuer : les questions'}
          <span className="ms text-[20px]">arrow_forward</span>
        </button>
        {!ok && (
          <p className="mx-auto mt-2 max-w-md text-center text-xs text-slate-500">
            Donnez un titre (3 lettres minimum) pour continuer.
          </p>
        )}
      </div>
    </main>
  );
}
