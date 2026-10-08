'use client';
import { useState } from 'react';
import { isVisible, type Field, type Section } from '@/lib/draft';

type Props = {
  title: string; description?: string; sections: Section[]; preview?: boolean; onBack?: () => void;
  posterUrl?: string | null; pdfUrl?: string | null; pdfDownloadUrl?: string | null; pdfName?: string | null;
  onSubmit: (answers: Record<string, any>) => Promise<{ reference: string } | void>;
  onUpload?: (fieldKey: string, file: File, onProgress?: (pct: number) => void) => Promise<{ id: string; name: string }>;
};
const STEPS = ['Présentation', 'Formulaire', 'Vérification', 'Confirmation'];

type Up = { names: Record<string, string>; upload?: (key: string, file: File, onProgress?: (pct: number) => void) => Promise<{ id: string; name: string }>; remember: (id: string, name: string) => void };
const IMG = /^image\/(jpeg|png|webp)$/;
/** Réduit les grosses photos de téléphone (≈ 1800 px, JPEG) avant l'envoi : plus rapide sur réseau mobile et sous la limite de taille. */
async function shrink(file: File): Promise<File> {
  if (!IMG.test(file.type) || file.size < 1_200_000 || typeof createImageBitmap === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}
const mo = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

/** Avis de recrutement (PDF) joint à l'offre : ouverture dans un nouvel onglet + téléchargement. */
function PdfBlock({ url, download, name }: { url?: string | null; download?: string | null; name?: string | null }) {
  if (!url) return null;
  return (<div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><span className="ms text-[26px]">picture_as_pdf</span></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">Avis de recrutement</span><span className="block truncate text-xs text-slate-500">{name ?? 'Document PDF'}</span></span>
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center gap-1 rounded-xl bg-blue-50 px-3 text-sm font-semibold text-blue-700"><span className="ms text-[18px]">visibility</span>Lire</a>
    {download && <a href={download} aria-label="Télécharger l'avis" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700"><span className="ms text-[20px]">download</span></a>}</div>);
}

function FileInput({ f, v, set, up }: { f: Field; v: string[] | undefined; set: (x: any) => void; up: Up }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [pct, setPct] = useState(0); const [prev, setPrev] = useState<Record<string, string>>({}); const [last, setLast] = useState<File | null>(null);
  const ids = v ?? []; const cfg = (f.config as any) ?? {}; const max = Number(cfg.maxCount) || (cfg.multiple ? 5 : 1); const maxMb = Math.min(Number(cfg.maxSizeMb) || 5, 25);
  const accept = f.type === 'image' ? 'image/jpeg,image/png,image/webp' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/jpeg,image/png,image/webp';
  const hint = f.type === 'image' ? `Photo JPG, PNG ou WebP · ${maxMb} Mo max` : `PDF, Word, Excel ou photo · ${maxMb} Mo max`;
  if (!up.upload) return (<div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm"><span className="ms text-[22px]">upload_file</span></span><span className="text-sm text-muted">{hint}<br />(envoi désactivé dans l'aperçu)</span></div>);

  async function send(raw: File) {
    setErr(''); setLast(raw); setBusy(true); setPct(0);
    try {
      const file = await shrink(raw);
      if (file.size > maxMb * 1_048_576) throw new Error(`Ce fichier fait ${mo(file.size)}. Maximum : ${maxMb} Mo. Choisissez un fichier plus léger.`);
      const r = await up.upload!(f.key, file, setPct);
      up.remember(r.id, r.name); if (IMG.test(file.type)) setPrev((m) => ({ ...m, [r.id]: URL.createObjectURL(file) }));
      set([...ids, r.id]); setLast(null);
    } catch (x: any) { setErr(x.message || "L'envoi a échoué. Réessayez."); } finally { setBusy(false); }
  }
  return (<div className="space-y-2">
    {ids.map((id) => (<div key={id} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
      {prev[id] ? <img src={prev[id]} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700"><span className="ms text-[24px]">description</span></span>}
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{up.names[id] ?? 'Fichier'}</span><span className="flex items-center gap-1 text-xs text-emerald-700"><span className="ms text-[14px]">check_circle</span>Prêt pour l'envoi</span></span>
      <button type="button" aria-label="Retirer ce fichier" className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-500" onClick={() => set(ids.filter((x) => x !== id))}><span className="ms text-[20px]">close</span></button></div>))}
    {busy && <div className="rounded-xl border border-slate-200 bg-white p-3" role="status" aria-live="polite"><p className="text-sm font-medium text-slate-700">{pct < 100 ? `Envoi en cours… ${pct} %` : 'Vérification du fichier…'}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(pct, 4)}%` }} /></div></div>}
    {!busy && ids.length < max && <label className="flex min-h-[64px] cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-primary active:scale-[0.99]">
      <span className="ms text-[26px]">upload_file</span><span className="text-left"><span className="block text-sm font-semibold">{ids.length ? 'Ajouter un autre fichier' : 'Choisir un fichier ou une photo'}</span><span className="block text-xs font-normal text-slate-500">{hint}</span></span>
      <input type="file" hidden accept={accept} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void send(file); }} /></label>}
    {err && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{err}</p>{last && <button type="button" className="mt-1 font-semibold underline" onClick={() => void send(last)}>Réessayer</button>}</div>}</div>);
}

function Input({ f, v, set, up }: { f: Field; v: any; set: (x: any) => void; up: Up }) {
  const cls = 'field-k';
  if (f.type === 'longtext') return <textarea className={cls} rows={4} value={v ?? ''} onChange={(e) => set(e.target.value)} />;
  if (f.type === 'single' || f.type === 'yesno') {
    const o = f.type === 'yesno' ? [{ label: 'Oui', value: 'oui' }, { label: 'Non', value: 'non' }] : f.options;
    return <div className="flex flex-wrap gap-2">{o.map((x) => <button type="button" key={x.value} onClick={() => set(x.value)}
      className={`rounded-xl border px-4 py-2 text-sm font-medium ${v === x.value ? 'border-primary bg-primary text-white' : 'border-line bg-white'}`}>{x.label}</button>)}</div>;
  }
  if (f.type === 'multi') { const a: string[] = v ?? [];
    return <div className="flex flex-wrap gap-2">{f.options.map((x) => <button type="button" key={x.value} onClick={() => set(a.includes(x.value) ? a.filter((y) => y !== x.value) : [...a, x.value])}
      className={`rounded-xl border px-4 py-2 text-sm font-medium ${a.includes(x.value) ? 'border-primary bg-primary text-white' : 'border-line bg-white'}`}>{x.label}</button>)}</div>; }
  if (f.type === 'file' || f.type === 'image') return <FileInput f={f} v={v} set={set} up={up} />;
  const t = { number: 'number', date: 'date', phone: 'tel', email: 'email' }[f.type as string] ?? 'text';
  return <input className={cls} type={t} inputMode={f.type === 'number' ? 'numeric' : undefined} value={v ?? ''} onChange={(e) => set(e.target.value)} />;
}

export default function CandidateFlow({ title, description, sections, preview, onBack, onSubmit, onUpload, posterUrl, pdfUrl, pdfDownloadUrl, pdfName }: Props) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0); const [a, setA] = useState<Record<string, any>>({});
  const [errs, setErrs] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<string | null>(null); const [err, setErr] = useState('');
  const fields = sections.flatMap((s) => s.fields);
  const missing = () => fields.filter((f) => f.required && isVisible(f, a) && (a[f.key] === undefined || a[f.key] === '' || (Array.isArray(a[f.key]) && !a[f.key].length))).map((f) => f.key);
  const show = (v: any) => Array.isArray(v) ? v.map((x) => names[x] ?? x).join(', ') : v === undefined || v === '' ? '—' : String(v);

  async function submit() {
    setBusy(true); setErr('');
    try { const r = await onSubmit(a); setRef(r ? r.reference : 'CAND-APERCU'); setStep(3); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (preview) return (<div className="min-h-dvh bg-subtle pb-32">
    <header className="fixed top-0 z-20 w-full bg-white/90 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-16 max-w-md items-center gap-3 px-4">
        <button aria-label="Retour" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800" style={{ borderBottomWidth: 3 }}><span className="ms text-[20px]">arrow_back</span></button>
        <span className="min-w-0 flex-1 truncate font-head text-lg font-bold text-slate-900">Aperçu candidat</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-blue-700" />Mode simulation</span></div></header>
    <div className="mx-auto max-w-md pt-16">
      <div className="relative flex h-[260px] flex-col justify-end bg-gradient-to-br from-primary-deep via-primary to-electric-blue bg-cover bg-center p-5" style={posterUrl ? { backgroundImage: `linear-gradient(to top, rgba(0,20,60,.75), rgba(0,20,60,.05)), url("${posterUrl}")` } : undefined}>
        <span className="mb-3 w-fit rounded-md bg-white/20 px-2.5 py-1 text-[11px] font-bold tracking-wider text-white backdrop-blur">KIBAR APP</span>
        <h1 className="break-words font-head text-[28px] font-bold leading-tight tracking-tight text-white">{title}</h1></div>
      <div className="px-5 pt-6">
        {description && <p className="whitespace-pre-line text-base leading-relaxed text-slate-600">{description}</p>}
        <PdfBlock url={pdfUrl} download={pdfDownloadUrl} name={pdfName} />
        <div className="card-k mt-6 !rounded-3xl !p-5">
          <h2 className="font-head text-2xl font-bold text-slate-900">Votre candidature</h2>
          <div className="mt-5 space-y-5">{sections.map((sec) => <section key={sec.id}>
            {sections.length > 1 && <h3 className="mb-3 font-head text-base font-bold text-slate-900">{sec.title}</h3>}
            <div className="space-y-5">{sec.fields.filter((f) => isVisible(f, a)).map((f) => <label key={f.key} className="block">
              <span className="mb-2 block text-[15px] font-semibold text-slate-900">{f.label}{f.required && <span className="text-red-600"> *</span>}</span>
              <Input up={{ names, upload: undefined, remember: () => undefined }} f={f} v={a[f.key]} set={(x) => setA({ ...a, [f.key]: x })} /></label>)}</div></section>)}</div>
          <p className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><span className="ms text-[16px] text-blue-700">verified_user</span>Postuler via KIBAR APP · Sécurisé et sans compte</p></div></div></div></div>);

  return (<div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-28 pt-6">
    <div className="mb-6 flex gap-1.5">{STEPS.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-line'}`} />)}</div>

    {step === 0 && <>{posterUrl && <img src={posterUrl} alt="" className="mb-5 max-h-64 w-full rounded-2xl object-cover" />}
      <h1 className="font-head text-3xl font-bold leading-tight break-words">{title}</h1>
      <p className="mt-3 whitespace-pre-line text-sm text-muted">{description}</p>
      <PdfBlock url={pdfUrl} download={pdfDownloadUrl} name={pdfName} /></>}

    {step === 1 && <div className="space-y-6">{sections.map((s) => <section key={s.id}>
      <h2 className="font-head text-lg font-bold">{s.title}</h2>
      <div className="mt-3 space-y-4">{s.fields.filter((f) => isVisible(f, a)).map((f) => <label key={f.key} className="block">
        <span className="mb-1.5 block text-sm font-semibold">{f.label}{f.required && <span className="text-error"> *</span>}</span>
        <Input up={{ names, upload: preview ? undefined : onUpload, remember: (id, n) => setNames((m) => ({ ...m, [id]: n })) }} f={f} v={a[f.key]} set={(x) => { setA({ ...a, [f.key]: x }); setErrs(errs.filter((k) => k !== f.key)); }} />
        {errs.includes(f.key) && <span className="mt-1 block text-xs text-error">Champ requis</span>}</label>)}</div></section>)}</div>}

    {step === 2 && <><h1 className="font-head text-2xl font-bold">Vérifier ma candidature</h1>
      <div className="mt-4 space-y-3">{fields.filter((f) => isVisible(f, a)).map((f) => <div key={f.key} className="card">
        <p className="text-xs text-muted">{f.label}</p><p className="mt-0.5 break-words text-sm font-medium">{show(a[f.key])}</p></div>)}</div>
      {err && <p className="mt-3 text-sm text-error">{err}</p>}</>}

    {step === 3 && <div className="mt-10 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl text-success">✓</div>
      <h1 className="mt-4 font-head text-2xl font-bold">Candidature envoyée</h1>
      <p className="mt-2 text-sm text-muted">Référence</p><p className="font-mono text-lg font-bold">{ref}</p></div>}

    {step < 3 && <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-md gap-3">
        {step > 0 && <button className="rounded-xl border border-line px-5 py-3 text-sm font-semibold" onClick={() => setStep(step - 1)}>{step === 2 ? 'Modifier' : 'Retour'}</button>}
        <button className="btn flex-1" disabled={busy} onClick={() => {
          if (step === 0) setStep(1);
          else if (step === 1) { const m = missing(); setErrs(m); if (!m.length) setStep(2); }
          else submit();
        }}>{step === 0 ? 'Postuler' : step === 1 ? 'Vérifier ma candidature' : busy ? 'Envoi…' : 'Soumettre définitivement'}</button></div></div>}
  </div>);
}
