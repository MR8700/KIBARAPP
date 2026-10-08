'use client';
import { Suspense } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CandidateFlow from '@/components/CandidateFlow';
import { LogoMark } from '@/components/Logo';
import Stepper from '@/components/Stepper';
import { TEMPLATES, cloneDraft, tplById } from '@/lib/templates';
import { api, API } from '@/lib/api';
import { friendly } from '@/lib/friendly';
import { allKeys, newKey, TYPES, type Draft, type Field, type FieldType } from '@/lib/draft';
import { useAutosave } from '@/lib/useAutosave';

const ICON: Record<string, string> = { text: 'text_fields', longtext: 'notes', number: 'pin', single: 'radio_button_checked', multi: 'checklist', date: 'calendar_today', yesno: 'toggle_on', phone: 'call', email: 'mail', file: 'upload_file', image: 'badge' };
const SHORT: Record<string, string> = { text: 'Texte', longtext: 'Texte long', number: 'Nombre', single: 'Choix unique', multi: 'Choix multiple', date: 'Date', yesno: 'Oui / Non', phone: 'Téléphone', email: 'Email', file: 'Fichier', image: 'Photo / Scan' };
const HINT: Record<string, string> = { text: 'Nom, ville…', longtext: 'Réponse libre', number: 'Âge, années…', single: 'Une seule réponse', multi: 'Plusieurs réponses', date: 'Naissance, dispo…', yesno: 'Oui ou non', phone: 'WhatsApp', email: 'Adresse email', file: 'CV, diplômes', image: 'Photo, pièce d\'identité' };
const pill = 'rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600';

/** Panneau d'édition d'un champ (ouvert par le menu « … »). */
function Edit({ f, all, onChange, onDelete }: { f: Field; all: Field[]; onChange: (f: Field) => void; onDelete: () => void }) {
  const hasOpts = f.type === 'single' || f.type === 'multi';
  const ctrl = all.filter((x) => x.key !== f.key && (x.type === 'yesno' || x.type === 'single') && !x.conditions.length);
  const c = f.conditions[0]; const parent = ctrl.find((x) => x.key === c?.dependsOnKey);
  const opts = parent ? (parent.type === 'yesno' ? [{ label: 'Oui', value: 'oui' }, { label: 'Non', value: 'non' }] : parent.options) : [];
  return (<div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
    <input className="w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold" value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value })} aria-label="Intitulé du champ" />
    <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={f.required} onChange={(e) => onChange({ ...f, required: e.target.checked })} />Obligatoire</label>
    {hasOpts && <textarea className="w-full rounded-lg border border-line p-2" rows={3} placeholder="Une option par ligne" value={f.options.map((o) => o.label).join('\n')}
      onChange={(e) => onChange({ ...f, options: e.target.value.split('\n').filter(Boolean).map((l, i) => ({ label: l, value: l.toLowerCase().replace(/\s+/g, '_') || String(i) })) })} />}
    {!!ctrl.length && <div className="flex flex-wrap items-center gap-2 text-slate-600"><span>Afficher si</span>
      <select className="rounded-lg border border-line px-2 py-1" value={c?.dependsOnKey ?? ''} onChange={(e) => { const p = ctrl.find((x) => x.key === e.target.value); onChange({ ...f, conditions: p ? [{ dependsOnKey: p.key, operator: 'eq', value: p.type === 'yesno' ? 'oui' : p.options[0]?.value }] : [] }); }}>
        <option value="">— toujours —</option>{ctrl.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
      {parent && <><span>=</span><select className="rounded-lg border border-line px-2 py-1" value={String(c.value)} onChange={(e) => onChange({ ...f, conditions: [{ ...c, value: e.target.value }] })}>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></>}</div>}
    <button className="font-semibold text-error" onClick={onDelete}>Supprimer le champ</button></div>);
}

function Card({ f, all, onChange, onDelete, sub = false, dragProps }: { f: Field; all: Field[]; onChange: (f: Field) => void; onDelete: () => void; sub?: boolean; dragProps?: any }) {
  const [open, setOpen] = useState(false);
  return (<div className={`${sub ? 'rounded-xl border border-slate-300 bg-white p-3' : 'card-k !p-3.5'}`} style={sub ? { borderBottomWidth: 3, borderBottomColor: '#94a3b8' } : undefined}>
    <div className="flex items-start gap-2">
      {!sub && <button aria-label="Déplacer" className="touch-none pt-0.5 text-slate-300" {...dragProps}><span className="ms text-[18px]">drag_indicator</span></button>}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="ms text-[20px] text-blue-700">{ICON[f.type] ?? 'text_fields'}</span>
        <span className={`min-w-0 break-words font-medium text-slate-900 ${sub ? 'text-sm' : 'text-[15px]'}`}>{f.label}</span>
        {f.required && <span className={pill}>Obligatoire</span>}</div>
      <span className="shrink-0 pt-0.5 text-xs text-slate-500">{SHORT[f.type]}</span>
      <button aria-label="Options du champ" aria-expanded={open} className="shrink-0 text-slate-400" onClick={() => setOpen(!open)}><span className="ms text-[20px]">more_horiz</span></button></div>
    {open && <Edit f={f} all={all} onChange={onChange} onDelete={onDelete} />}</div>);
}

function Row({ f, kids, all, onChange, onDelete }: { f: Field; kids: Field[]; all: Field[]; onChange: (f: Field) => void; onDelete: (key: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.key });
  const ok = kids[0]?.conditions[0];
  const valueLabel = !ok ? '' : f.type === 'yesno' ? (ok.value === 'oui' ? 'OUI' : 'NON') : (f.options.find((o) => o.value === ok.value)?.label ?? String(ok.value));
  return (<div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'relative z-10 scale-[1.02]' : ''}>
    <Card f={f} all={all} onChange={onChange} onDelete={() => onDelete(f.key)} dragProps={{ ...attributes, ...listeners }} />
    {!!kids.length && <div className="ml-4 mt-2 border-l-4 border-blue-200 pl-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-blue-700"><span className="ms text-[14px]">call_split</span>Si {f.label} = {valueLabel} → +{kids.length} champ{kids.length > 1 ? 's' : ''}</p>
      <div className="space-y-2">{kids.map((k) => <Card key={k.key} sub f={k} all={all} onChange={onChange} onDelete={() => onDelete(k.key)} />)}</div></div>}
  </div>);
}

function Builder() {
  const { id } = useParams<{ id: string }>(); const org = useSearchParams().get('org') ?? '';
  const [access, setAccess] = useState(''); const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null); const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit'); const [msg, setMsg] = useState('');
  const [published, setPublished] = useState<string | null>(null); const [copied, setCopied] = useState(false); const [tip, setTip] = useState(false); const tplDone = useRef(false);
  const [assets, setAssets] = useState<{ posterUrl: string | null; pdfUrl: string | null; pdfDownloadUrl: string | null; pdfName: string | null }>({ posterUrl: null, pdfUrl: null, pdfDownloadUrl: null, pdfName: null }); const [assetBusy, setAssetBusy] = useState('');
  const [editTitle, setEditTitle] = useState(false); const [folded, setFolded] = useState<Record<string, boolean>>({}); const [picker, setPicker] = useState<string | null>(null); const [secMenu, setSecMenu] = useState<string | null>(null);
  const base = `/orgs/${org}/recruitments/${id}`;
  useEffect(() => { const t = sessionStorage.getItem('kibar.access') ?? ''; setAccess(t);
    api<any>(base, {}, t).then((r) => { setTitle(r.title); setDescription(r.description); setVersion(r.draftVersion); setAssets({ posterUrl: r.posterUrl ?? null, pdfUrl: r.pdfUrl ?? null, pdfDownloadUrl: r.pdfDownloadUrl ?? null, pdfName: r.pdfName ?? null });
      setDraft(r.draftState?.sections?.length ? r.draftState : { sections: [{ id: 's1', title: 'Informations personnelles', fields: [] }] }); }).catch((e) => setMsg(e.message)); }, [base]);
  const save = useAutosave(base + '/draft', access, draft, version);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }), // appui long sur mobile
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => { if (!draft || tplDone.current) return; tplDone.current = true; setTip(localStorage.getItem('kibar.tip.builder') !== '1');
    const t = tplById(sessionStorage.getItem(`kibar.tpl.${id}`)); sessionStorage.removeItem(`kibar.tpl.${id}`);
    if (t && !draft.sections.some((x) => x.fields.length)) setDraft(cloneDraft(t.draft)); }, [draft, id]);
  if (!draft) return <main className="p-10 text-center text-sm text-muted">{msg || 'Chargement…'}</main>;

  const allFields = draft.sections.flatMap((s) => s.fields);
  const setSection = (sid: string, p: Partial<{ title: string; fields: Field[] }>) => setDraft({ sections: draft.sections.map((s) => (s.id === sid ? { ...s, ...p } : s)) });
  const add = (sid: string, type: FieldType) => { const sec = draft.sections.find((s) => s.id === sid)!; const label = TYPES.find((t) => t.type === type)!.label;
    setSection(sid, { fields: [...sec.fields, { key: newKey(label, allKeys(draft)), type, label, required: false, options: [], conditions: [] }] }); setPicker(null); };
  const addSection = () => { const n = draft.sections.length + 1; setDraft({ sections: [...draft.sections, { id: `s${Date.now().toString(36)}`, title: `Section ${n}`, fields: [] }] }); };
  const saveTitle = async () => { setEditTitle(false); try { await api(base, { method: 'PATCH', body: JSON.stringify({ title: title.trim() }) }, access); } catch (e: any) { setMsg(e.message); } };
  async function sendAsset(kind: 'poster' | 'pdf', file?: File) {
    if (!file) return; setMsg(''); setAssetBusy(kind);
    try { const fd = new FormData(); fd.append('file', file);
      const r = await fetch(`${API}${base}/assets/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${access}` }, body: fd });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((Array.isArray(j.message) ? j.message[0] : j.message) ?? 'Envoi impossible. Réessayez.');
      setAssets(j); } catch (e: any) { setMsg(friendly(e)); } finally { setAssetBusy(''); }
  }
  async function dropAsset(kind: 'poster' | 'pdf') {
    setAssetBusy(kind); try { setAssets(await api(`${base}/assets/${kind}`, { method: 'DELETE' }, access)); } catch (e: any) { setMsg(friendly(e)); } finally { setAssetBusy(''); }
  }
  const total = allFields.length;
  const label = { saved: 'Enregistré', saving: 'Enregistrement…', error: 'Hors ligne', conflict: 'Version plus récente' }[save];
  const tone = save === 'saved' ? 'bg-emerald-50 text-emerald-700' : save === 'saving' ? 'bg-slate-100 text-slate-500' : 'bg-red-50 text-red-600';

  if (published) { const wa = `https://wa.me/?text=${encodeURIComponent(`Nous recrutons : ${title}. Postulez en quelques minutes ici : ${published}`)}`;
    return (<main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-8">
      <Stepper step={4} />
      <div className="my-auto text-center"><span className="mx-auto flex h-24 w-24 animate-[pop_.6s_ease-out] items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><span className="ms text-[56px]">check_circle</span></span>
        <h1 className="mt-6 font-head text-[28px] font-extrabold leading-tight tracking-tight">Votre recrutement est en ligne !</h1>
        <p className="mt-2 text-base text-slate-600">Il ne reste qu'à partager ce lien. Les candidats postulent depuis leur téléphone, sans créer de compte.</p>
        <div className="card-k mt-6 break-all text-left text-sm font-medium text-primary">{published}</div>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn mt-4 w-full !py-4 text-base" style={{ backgroundColor: '#16a34a', borderBottomColor: '#166534' }}><span className="ms text-[22px]">send</span>Partager sur WhatsApp</a>
        <button className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-800" onClick={() => { navigator.clipboard?.writeText(published).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => undefined); }}><span className="ms text-[20px]">{copied ? 'check' : 'content_copy'}</span>{copied ? 'Lien copié !' : 'Copier le lien'}</button></div>
      <Link href="/app/dashboard" className="py-3 text-center text-sm font-semibold text-slate-600 underline underline-offset-4">Retour à mes recrutements</Link></main>); }

  if (mode === 'preview') return (<>
    <CandidateFlow preview title={title} description={description} sections={draft.sections} {...assets} onBack={() => setMode('edit')} onSubmit={async () => undefined} />
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white/95 px-5 pt-3 backdrop-blur" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex max-w-md gap-3">
        <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-b-[3px] border-blue-200 bg-blue-50 py-3.5 text-[15px] font-bold text-slate-900" onClick={() => setMode('edit')}><span className="ms text-[18px]">arrow_back</span>Modifier</button>
        <button className="btn flex-1 !py-3.5 text-[15px]" style={{ backgroundColor: '#004ac6', borderBottomColor: '#00288e' }} onClick={async () => {
          try { await api(base + '/preview-complete', { method: 'POST' }, access); const r = await api<{ publicToken: string }>(base + '/publish', { method: 'POST' }, access);
            setPublished(`${location.origin}/r/${r.publicToken}`); } catch (e: any) { setMsg(friendly(e)); setMode('edit'); } }}>Valider le lancement<span className="ms text-[18px]">arrow_forward</span></button></div></div></>);

  return (<>
    <header className="fixed top-0 z-30 w-full border-b border-slate-100 bg-white/90 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
        <Link href="/app/dashboard" aria-label="Retour" className="flex h-8 w-8 items-center justify-center text-slate-700"><span className="ms text-[22px]">arrow_back</span></Link>
        <LogoMark size={28} /><span className="min-w-0 flex-1 truncate font-head text-[15px] font-bold text-slate-900">Form Builder</span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{save === 'saved' && <span className="ms text-[14px]">check_circle</span>}{label}</span>
        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700" aria-label="Étape 2 sur 4">2 / 4</span></div></header>
    <main className="mx-auto max-w-md px-5 pb-32 pt-[4.5rem]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 pt-4">
        {editTitle ? <input autoFocus className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 font-head text-xl font-bold" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && saveTitle()} />
          : <h1 className="min-w-0 break-words font-head text-2xl font-bold leading-snug tracking-tight text-slate-900">{title}</h1>}
        <button aria-label="Modifier le titre" className="shrink-0 pt-1 text-slate-500" onClick={() => setEditTitle(true)}><span className="ms text-[20px]">edit</span></button></div>
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Affiche et avis">
        <h2 className="font-head text-base font-bold text-slate-900">Affiche et avis <span className="text-sm font-normal text-slate-500">(facultatif)</span></h2>
        <div className="mt-3 flex items-center gap-3">
          {assets.posterUrl ? <img src={assets.posterUrl} alt="Affiche" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><span className="ms text-[26px]">image</span></span>}
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Affiche</span><span className="block text-xs text-slate-500">Image JPG, PNG ou WebP · 5 Mo max</span></span>
          {assets.posterUrl && <button type="button" aria-label="Retirer l'affiche" disabled={!!assetBusy} className="flex h-11 w-11 items-center justify-center text-slate-500" onClick={() => void dropAsset('poster')}><span className="ms text-[20px]">delete</span></button>}
          <label className="flex h-11 cursor-pointer items-center rounded-xl bg-blue-50 px-3 text-sm font-semibold text-blue-700">{assetBusy === 'poster' ? 'Envoi…' : assets.posterUrl ? 'Changer' : 'Ajouter'}
            <input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={!!assetBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void sendAsset('poster', f); }} /></label></div>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><span className="ms text-[26px]">picture_as_pdf</span></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Avis de recrutement</span><span className="block truncate text-xs text-slate-500">{assets.pdfUrl ? 'PDF joint à l\'offre' : 'Fichier PDF · 15 Mo max'}</span></span>
          {assets.pdfUrl && <button type="button" aria-label="Retirer l'avis" disabled={!!assetBusy} className="flex h-11 w-11 items-center justify-center text-slate-500" onClick={() => void dropAsset('pdf')}><span className="ms text-[20px]">delete</span></button>}
          <label className="flex h-11 cursor-pointer items-center rounded-xl bg-blue-50 px-3 text-sm font-semibold text-blue-700">{assetBusy === 'pdf' ? 'Envoi…' : assets.pdfUrl ? 'Changer' : 'Ajouter'}
            <input type="file" hidden accept="application/pdf,.pdf" disabled={!!assetBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void sendAsset('pdf', f); }} /></label></div></section>
      {msg && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</p>}
      {!allFields.length && <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="font-head text-base font-bold text-slate-900">Gagnez du temps avec un modèle</p>
        <p className="mt-1 text-sm text-slate-600">Nous préparons les questions courantes. Vous pourrez les modifier ou en ajouter.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">{TEMPLATES.map((t) => <button key={t.id} onClick={() => setDraft(cloneDraft(t.draft))} className="flex min-h-[48px] items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800"><span className="ms text-[20px] text-primary">{t.icon}</span>{t.name}</button>)}</div>
        <p className="mt-3 text-xs text-slate-500">Ou ajoutez vos questions une par une avec « Ajouter un champ ».</p></div>}
      {tip && !!allFields.length && <div className="mt-4 flex items-start gap-3 rounded-2xl bg-blue-50 p-3 text-xs leading-relaxed text-slate-700"><span className="ms text-[20px] text-primary">lightbulb</span>
        <p className="flex-1"><b>Astuce :</b> touchez « ⋯ » pour modifier une question ou la rendre obligatoire. Maintenez la poignée « ⠿ » pour la déplacer.</p>
        <button aria-label="Fermer l'astuce" className="text-slate-500" onClick={() => { setTip(false); localStorage.setItem('kibar.tip.builder', '1'); }}><span className="ms text-[18px]">close</span></button></div>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => navigator.vibrate?.(15)}
        onDragEnd={({ active, over }) => { if (!over || active.id === over.id) return;
          const sec = draft.sections.find((s) => s.fields.some((f) => f.key === active.id)); if (!sec || !sec.fields.some((f) => f.key === over.id)) return;
          const tops = sec.fields.filter((f) => !f.conditions.length); const o = tops.findIndex((f) => f.key === active.id), n = tops.findIndex((f) => f.key === over.id); if (o < 0 || n < 0) return;
          setSection(sec.id, { fields: arrayMove(tops, o, n).flatMap((t) => [t, ...sec.fields.filter((k) => k.conditions[0]?.dependsOnKey === t.key)]).concat(sec.fields.filter((k) => k.conditions.length && !tops.some((t) => t.key === k.conditions[0].dependsOnKey))) }); }}>
        {draft.sections.map((sec, si) => { const tops = sec.fields.filter((f) => !f.conditions.length || !sec.fields.some((p) => p.key === f.conditions[0].dependsOnKey)); const isF = folded[sec.id];
          return (<section key={sec.id} className="mt-7">
            <div className="mb-3 flex items-center gap-2"><span className="ms text-[18px] text-slate-300">drag_indicator</span>
              <span className="font-head text-lg font-bold text-slate-900">{String(si + 1).padStart(2, '0')}.</span>
              <input className="min-w-0 flex-1 bg-transparent font-head text-lg font-bold tracking-tight text-slate-900 outline-none" value={sec.title} onChange={(e) => setSection(sec.id, { title: e.target.value })} aria-label="Titre de la section" />
              <div className="relative"><button aria-label="Options de la section" className="text-slate-500" onClick={() => setSecMenu(secMenu === sec.id ? null : sec.id)}><span className="ms text-[20px]">more_horiz</span></button>
                {secMenu === sec.id && <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-line bg-white p-1 text-xs shadow-xl">
                  <button className="block w-full rounded-lg px-3 py-2 text-left text-error disabled:opacity-40" disabled={draft.sections.length < 2} onClick={() => { setDraft({ sections: draft.sections.filter((s) => s.id !== sec.id) }); setSecMenu(null); }}>Supprimer la section</button></div>}</div>
              <button aria-label={isF ? 'Déplier' : 'Replier'} className="text-slate-500" onClick={() => setFolded({ ...folded, [sec.id]: !isF })}><span className="ms text-[22px]">{isF ? 'expand_more' : 'expand_less'}</span></button></div>
            {!isF && <>
              <SortableContext items={tops.map((f) => f.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">{tops.map((f) => <Row key={f.key} f={f} all={allFields} kids={sec.fields.filter((k) => k.conditions[0]?.dependsOnKey === f.key)}
                  onChange={(nf) => setSection(sec.id, { fields: sec.fields.map((x) => (x.key === nf.key ? nf : x)) })}
                  onDelete={(key) => setSection(sec.id, { fields: sec.fields.filter((x) => x.key !== key && x.conditions[0]?.dependsOnKey !== key) })} />)}</div></SortableContext>
              {!tops.length && <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-muted">Aucun champ dans cette section</p>}
              <button onClick={() => setPicker(sec.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-600 bg-white py-3 text-sm font-semibold text-blue-700"><span className="ms text-[20px]">add_circle</span>Ajouter un champ</button></>}
          </section>); })}</DndContext>
      <button onClick={addSection} className="mt-6 w-full text-center text-sm font-semibold text-slate-500">+ Ajouter une section</button>
    </main>
    {picker && <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setPicker(null)}><div className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
      <p className="font-head text-base font-bold">Quelle information demander ?</p><p className="mb-3 text-xs text-slate-500">Choisissez le type de réponse attendu.</p>
      <div className="grid grid-cols-2 gap-2">{TYPES.map((t) => <button key={t.type} onClick={() => add(picker, t.type)} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-sm font-medium"><span className="ms text-[22px] text-blue-700">{ICON[t.type]}</span><span><span className="block">{t.label}</span><span className="block text-[11px] font-normal text-slate-500">{HINT[t.type]}</span></span></button>)}</div></div></div>}
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white/95 px-5 pt-3 backdrop-blur" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <button className="btn mx-auto flex w-full max-w-md !py-3.5 text-[15px]" style={{ backgroundColor: '#004ac6', borderBottomColor: '#00288e' }} disabled={!total} onClick={() => setMode('preview')}>Voir comme un candidat<span className="ms text-[18px]">arrow_forward</span></button>
      {!total && <p className="mx-auto mt-2 max-w-md text-center text-xs text-slate-500">Ajoutez au moins une question pour continuer.</p>}</div>
  </>);
}

export default function Page() { return <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}><Builder /></Suspense>; }
