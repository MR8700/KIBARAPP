'use client';
import { useState } from 'react';
import { isVisible, type Field, type Section } from '@/lib/draft';

type Props = {
  title: string;
  description?: string;
  sections: Section[];
  preview?: boolean;
  onBack?: () => void;
  posterUrl?: string | null;
  pdfUrl?: string | null;
  pdfDownloadUrl?: string | null;
  pdfName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isUpcoming?: boolean;
  isExpired?: boolean;
  onSubmit: (answers: Record<string, any>) => Promise<{ reference: string } | void>;
  onUpload?: (fieldKey: string, file: File, onProgress?: (pct: number) => void) => Promise<{ id: string; name: string }>;
};

const STEPS = ['Présentation', 'Formulaire', 'Vérification', 'Confirmation'];

type Up = {
  names: Record<string, string>;
  upload?: (key: string, file: File, onProgress?: (pct: number) => void) => Promise<{ id: string; name: string }>;
  remember: (id: string, name: string) => void;
};

const IMG = /^image\/(jpeg|png|webp)$/;

/** Réduit les photos lourdes avant envoi mobile */
async function shrink(file: File): Promise<File> {
  if (!IMG.test(file.type) || file.size < 1_200_000 || typeof createImageBitmap === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

const mo = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

function formatDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Avis de recrutement (PDF) joint à l'offre */
function PdfBlock({ url, download, name }: { url?: string | null; download?: string | null; name?: string | null }) {
  if (!url) return null;
  return (
    <div className="card-k mt-4 flex items-center gap-3 !p-3.5 shadow-xs">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 shadow-xs">
        <span className="ms text-[26px]">picture_as_pdf</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">Avis de recrutement</span>
        <span className="block truncate text-xs text-slate-500">{name ?? 'Document PDF'}</span>
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
      >
        <span className="ms text-[18px]">visibility</span>Consulter
      </a>
      {download && (
        <a
          href={download}
          aria-label="Télécharger l'avis"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 text-slate-700 hover:bg-slate-50 transition"
        >
          <span className="ms text-[18px]">download</span>
        </a>
      )}
    </div>
  );
}

function FileInput({ f, v, set, up }: { f: Field; v: string[] | undefined; set: (x: any) => void; up: Up }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pct, setPct] = useState(0);
  const [prev, setPrev] = useState<Record<string, string>>({});
  const [last, setLast] = useState<File | null>(null);

  const ids = v ?? [];
  const cfg = (f.config as any) ?? {};
  const max = Number(cfg.maxCount) || (cfg.multiple ? 5 : 1);
  const maxMb = Math.min(Number(cfg.maxSizeMb) || 5, 25);
  const accept =
    f.type === 'image'
      ? 'image/jpeg,image/png,image/webp'
      : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/jpeg,image/png,image/webp';
  const hint =
    f.type === 'image'
      ? `Photo JPG, PNG ou WebP · ${maxMb} Mo max`
      : `PDF, Word, Excel ou photo · ${maxMb} Mo max`;

  if (!up.upload) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-xs">
          <span className="ms text-[22px]">upload_file</span>
        </span>
        <span className="text-xs text-muted">
          {hint}
          <br />
          <span className="text-slate-400">(envoi désactivé dans l'aperçu)</span>
        </span>
      </div>
    );
  }

  async function send(raw: File) {
    setErr('');
    setLast(raw);
    setBusy(true);
    setPct(0);
    try {
      const file = await shrink(raw);
      if (file.size > maxMb * 1_048_576) {
        throw new Error(`Ce fichier fait ${mo(file.size)}. Maximum : ${maxMb} Mo. Choisissez un fichier plus léger.`);
      }
      const r = await up.upload!(f.key, file, setPct);
      up.remember(r.id, r.name);
      if (IMG.test(file.type)) {
        setPrev((m) => ({ ...m, [r.id]: URL.createObjectURL(file) }));
      }
      set([...ids, r.id]);
      setLast(null);
    } catch (x: any) {
      setErr(x.message || "L'envoi a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5">
      {ids.map((id) => (
        <div key={id} className="card-k !border-emerald-200 !bg-emerald-50/50 flex items-center gap-3 !p-3">
          {prev[id] ? (
            <img src={prev[id]} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-xs" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-xs">
              <span className="ms text-[24px]">description</span>
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-slate-900">{up.names[id] ?? 'Fichier'}</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <span className="ms text-[14px]">check_circle</span>Fichier joint
            </span>
          </span>
          <button
            type="button"
            aria-label="Retirer ce fichier"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-red-600 transition"
            onClick={() => set(ids.filter((x) => x !== id))}
          >
            <span className="ms text-[20px]">close</span>
          </button>
        </div>
      ))}

      {busy && (
        <div className="card-k !p-3.5 shadow-sm" role="status" aria-live="polite">
          <p className="text-xs font-bold text-slate-700">
            {pct < 100 ? `Envoi en cours… ${pct} %` : 'Vérification de sécurité du fichier…'}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
              style={{ width: `${Math.max(pct, 5)}%` }}
            />
          </div>
        </div>
      )}

      {!busy && ids.length < max && (
        <label className="flex min-h-[68px] cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-blue-400/80 bg-blue-50/40 hover:bg-blue-50/70 px-4 py-3 text-blue-700 transition active:scale-[0.99]">
          <span className="ms text-[28px] text-blue-600">upload_file</span>
          <span className="text-left">
            <span className="block text-sm font-bold">
              {ids.length ? 'Ajouter un autre fichier' : 'Choisir un fichier ou une photo'}
            </span>
            <span className="block text-xs font-normal text-slate-500">{hint}</span>
          </span>
          <input
            type="file"
            hidden
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void send(file);
            }}
          />
        </label>
      )}

      {err && (
        <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <p>{err}</p>
          {last && (
            <button
              type="button"
              className="mt-1 font-bold text-red-800 hover:text-red-950"
              onClick={() => void send(last)}
            >
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Input({ f, v, set, up }: { f: Field; v: any; set: (x: any) => void; up: Up }) {
  if (f.type === 'longtext')
    return (
      <textarea
        className="field-k"
        rows={4}
        value={v ?? ''}
        placeholder="Votre réponse…"
        onChange={(e) => set(e.target.value)}
      />
    );

  if (f.type === 'single' || f.type === 'yesno') {
    const o = f.type === 'yesno' ? [{ label: 'Oui', value: 'oui' }, { label: 'Non', value: 'non' }] : f.options;
    return (
      <div className="flex flex-wrap gap-2">
        {o.map((x) => {
          const on = v === x.value;
          return (
            <button
              type="button"
              key={x.value}
              onClick={() => set(x.value)}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                on
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                  : 'border border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {on && <span className="ms mr-1.5 text-[16px] align-middle">check</span>}
              {x.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (f.type === 'multi') {
    const a: string[] = v ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {f.options.map((x) => {
          const on = a.includes(x.value);
          return (
            <button
              type="button"
              key={x.value}
              onClick={() =>
                set(on ? a.filter((y) => y !== x.value) : [...a, x.value])
              }
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                on
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                  : 'border border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {on && <span className="ms mr-1.5 text-[16px] align-middle">check</span>}
              {x.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (f.type === 'file' || f.type === 'image') return <FileInput f={f} v={v} set={set} up={up} />;

  const t = { number: 'number', date: 'date', phone: 'tel', email: 'email' }[f.type as string] ?? 'text';
  return (
    <input
      className="field-k"
      type={t}
      inputMode={f.type === 'number' ? 'numeric' : undefined}
      value={v ?? ''}
      placeholder="Votre réponse…"
      onChange={(e) => set(e.target.value)}
    />
  );
}

export default function CandidateFlow({
  title,
  description,
  sections,
  preview,
  onBack,
  onSubmit,
  onUpload,
  posterUrl,
  pdfUrl,
  pdfDownloadUrl,
  pdfName,
  startsAt,
  endsAt,
  isUpcoming = false,
  isExpired = false,
}: Props) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Record<string, any>>({});
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const fields = sections.flatMap((s) => s.fields);
  const missing = () =>
    fields
      .filter(
        (f) =>
          f.required &&
          isVisible(f, a) &&
          (a[f.key] === undefined || a[f.key] === '' || (Array.isArray(a[f.key]) && !a[f.key].length))
      )
      .map((f) => f.key);

  const show = (v: any) =>
    Array.isArray(v) ? v.map((x) => names[x] ?? x).join(', ') : v === undefined || v === '' ? '—' : String(v);

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const r = await onSubmit(a);
      setRef(r ? r.reference : 'CAND-APERCU');
      setStep(3);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Dates d'ouverture et de clôture
  const dateBadge =
    startsAt && endsAt
      ? `Du ${formatDate(startsAt)} au ${formatDate(endsAt)}`
      : endsAt
      ? `Date limite : ${formatDate(endsAt)}`
      : startsAt
      ? `Ouverture : ${formatDate(startsAt)}`
      : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-32 pt-4">
      {/* Barre d'entête mobile avec sécurité */}
      <div className="flex items-center justify-between pb-3">
        {preview ? (
          <button
            onClick={onBack}
            className="flex h-9 items-center gap-1 rounded-xl bg-white/80 px-3 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md"
          >
            <span className="ms text-[18px]">arrow_back</span>Quitter l'aperçu
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-extrabold text-xs shadow-xs">
              K
            </span>
            <span className="font-head text-sm font-extrabold tracking-tight text-slate-900">KIBAR APP</span>
          </div>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
          <span className="ms text-[14px]">verified</span>Offre officielle vérifiée
        </span>
      </div>

      {/* Barre de progression des étapes */}
      <div className="my-3 space-y-1.5">
        <div className="flex justify-between text-[11px] font-bold text-slate-500">
          <span>Étape {step + 1}/4 : {STEPS[step]}</span>
          <span>{Math.round(((step + 1) / 4) * 100)} %</span>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                i <= step
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-xs'
                  : 'bg-slate-200/80'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Alerte si le recrutement est fermé ou à venir */}
      {isUpcoming && (
        <div className="card-k mt-2 !border-amber-200 !bg-amber-50/80 p-3.5 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2 font-bold">
            <span className="ms text-[20px] text-amber-600">schedule</span>
            <span>Candidatures non ouvertes</span>
          </div>
          <p className="mt-1 leading-relaxed">
            Ce recrutement débutera le <b>{formatDate(startsAt)}</b>. Vous pouvez consulter les détails ci-dessous.
          </p>
        </div>
      )}

      {isExpired && (
        <div className="card-k mt-2 !border-rose-200 !bg-rose-50/80 p-3.5 text-xs text-rose-900 shadow-xs">
          <div className="flex items-center gap-2 font-bold">
            <span className="ms text-[20px] text-rose-600">event_busy</span>
            <span>Période de candidature clôturée</span>
          </div>
          <p className="mt-1 leading-relaxed">
            Les dépôts pour ce recrutement ont pris fin le <b>{formatDate(endsAt)}</b>.
          </p>
        </div>
      )}

      {/* ÉTAPE 0 : PRÉSENTATION DU POSTE */}
      {step === 0 && (
        <div className="mt-3 space-y-5 animate-[fadeup_.3s_ease-out]">
          {/* Hero Banner avec affiche ou dégradé */}
          <div
            className="relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-700 to-blue-900 p-5 text-white shadow-xl"
            style={
              posterUrl
                ? {
                    backgroundImage: `linear-gradient(to top, rgba(15,23,42,.85) 0%, rgba(15,23,42,.2) 60%), url("${posterUrl}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <div className="space-y-2">
              <span className="inline-block rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-md">
                Offre de recrutement
              </span>
              <h1 className="font-head text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">
                {title}
              </h1>
            </div>
          </div>

          {/* Badges et Dates de réception */}
          <div className="card-k !p-3.5 space-y-2.5">
            {dateBadge && (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <span className="ms text-[16px]">calendar_today</span>
                </span>
                <span>{dateBadge}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600 pt-1 border-t border-slate-100">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                <span className="ms text-[13px] text-blue-600">smartphone</span>100% Mobile
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                <span className="ms text-[13px] text-emerald-600">no_accounts</span>Sans mot de passe
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                <span className="ms text-[13px] text-indigo-600">lock</span>Dossier sécurisé
              </span>
            </div>
          </div>

          {/* Description */}
          {description && (
            <div className="card-k !p-4">
              <h2 className="font-head text-base font-bold text-slate-900 mb-2">Description du poste</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
          )}

          {/* Avis PDF */}
          <PdfBlock url={pdfUrl} download={pdfDownloadUrl} name={pdfName} />
        </div>
      )}

      {/* ÉTAPE 1 : FORMULAIRE DE CANDIDATURE */}
      {step === 1 && (
        <div className="mt-3 space-y-6 animate-[fadeup_.3s_ease-out]">
          <div className="card-k !p-4">
            <h1 className="font-head text-xl font-extrabold text-slate-900">Remplir votre candidature</h1>
            <p className="mt-1 text-xs text-slate-500">
              Veuillez répondre attentivement aux questions ci-dessous.
            </p>
          </div>

          {sections.map((sec, si) => (
            <section key={sec.id} className="card-k !p-4 space-y-4">
              {sections.length > 1 && (
                <div className="border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                    Section {si + 1}
                  </span>
                  <h2 className="font-head text-base font-bold text-slate-900">{sec.title}</h2>
                </div>
              )}
              <div className="space-y-4">
                {sec.fields
                  .filter((f) => isVisible(f, a))
                  .map((f) => (
                    <label key={f.key} className="block">
                      <span className="mb-2 block text-sm font-bold text-slate-900">
                        {f.label}
                        {f.required && <span className="text-red-600"> *</span>}
                      </span>
                      <Input
                        up={{
                          names,
                          upload: preview ? undefined : onUpload,
                          remember: (id, n) => setNames((m) => ({ ...m, [id]: n })),
                        }}
                        f={f}
                        v={a[f.key]}
                        set={(x) => {
                          setA({ ...a, [f.key]: x });
                          setErrs(errs.filter((k) => k !== f.key));
                        }}
                      />
                      {errs.includes(f.key) && (
                        <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                          <span className="ms text-[14px]">error</span>Ce champ est obligatoire
                        </span>
                      )}
                    </label>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ÉTAPE 2 : VÉRIFICATION DU DOSSIER */}
      {step === 2 && (
        <div className="mt-3 space-y-5 animate-[fadeup_.3s_ease-out]">
          <div className="card-k !p-4">
            <h1 className="font-head text-xl font-extrabold text-slate-900">Vérifier vos informations</h1>
            <p className="mt-1 text-xs text-slate-500">
              Assurez-vous de l'exactitude de vos réponses avant la soumission finale.
            </p>
          </div>

          <div className="space-y-3">
            {fields
              .filter((f) => isVisible(f, a))
              .map((f) => (
                <div key={f.key} className="card-k !p-3.5">
                  <span className="block text-xs font-semibold text-slate-500">{f.label}</span>
                  <span className="mt-1 block break-words text-sm font-bold text-slate-900">
                    {show(a[f.key])}
                  </span>
                </div>
              ))}
          </div>

          {err && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
              {err}
            </div>
          )}
        </div>
      )}

      {/* ÉTAPE 3 : CONFIRMATION ET SUCCÈS */}
      {step === 3 && (
        <div className="my-auto text-center py-6 animate-[fadeup_.4s_ease-out]">
          <span className="mx-auto flex h-24 w-24 animate-[pop_.6s_ease-out] items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-xl shadow-emerald-500/20">
            <span className="ms text-[56px]">check_circle</span>
          </span>

          <h1 className="mt-6 font-head text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Candidature envoyée !
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Votre dossier a été transmis avec succès aux recruteurs.
          </p>

          <div className="card-k mt-6 !border-blue-200 !bg-blue-50/60 p-5 shadow-sm">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Votre référence unique
            </span>
            <span className="mt-2 block font-mono text-2xl font-black tracking-wider text-blue-700 select-all">
              {ref}
            </span>
            <button
              type="button"
              className="btn-secondary mx-auto mt-3 !py-2 !px-4 text-xs"
              onClick={() => {
                if (ref) {
                  navigator.clipboard?.writeText(ref);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              <span className="ms text-[16px]">{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Référence copiée !' : 'Copier ma référence'}
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            💡 Conservez cette référence précieusement. Elle pourra vous être demandée pour le suivi de votre candidature.
          </p>
        </div>
      )}

      {/* BARRE D'ACTIONS FIXE DU BAS */}
      {step < 3 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-5 pt-3 backdrop-blur-md"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-md gap-3">
            {step > 0 && (
              <button
                className="btn-secondary !px-4 !py-3.5 text-sm"
                onClick={() => setStep(step - 1)}
              >
                {step === 2 ? 'Modifier' : 'Retour'}
              </button>
            )}
            <button
              className="btn flex-1 !py-3.5 text-base"
              disabled={busy || isUpcoming || isExpired}
              onClick={() => {
                if (step === 0) {
                  setStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (step === 1) {
                  const m = missing();
                  setErrs(m);
                  if (!m.length) {
                    setStep(2);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                } else {
                  submit();
                }
              }}
            >
              {isUpcoming
                ? 'Candidatures bientôt ouvertes'
                : isExpired
                ? 'Candidatures closes'
                : step === 0
                ? 'Postuler à cette offre'
                : step === 1
                ? 'Vérifier mon dossier'
                : busy
                ? 'Envoi en cours…'
                : 'Confirmer et envoyer'}
              <span className="ms text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
