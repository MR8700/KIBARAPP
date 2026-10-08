'use client';
type Props = { url: string; name: string; mime: string; onClose: () => void; onDownload?: () => void };

/** PDF → lecteur, image → plein écran, audio/vidéo → lecteur, autre → téléchargement. Toujours : Télécharger + Fermer. */
export default function FileViewer({ url, name, mime, onClose, onDownload }: Props) {
  return (<div role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-50 flex flex-col bg-black/90">
    <div className="flex items-center gap-2 p-3 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      {onDownload && <button className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-semibold" onClick={onDownload}><span className="ms text-[18px]">download</span>Télécharger</button>}
      <button aria-label="Fermer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15" onClick={onClose}><span className="ms text-[20px]">close</span></button></div>
    <div className="flex min-h-0 flex-1 items-center justify-center p-2">
      {mime.startsWith('image/') ? <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
        : mime === 'application/pdf' ? <iframe src={url} title={name} className="h-full w-full rounded-lg bg-white" />
        : mime.startsWith('video/') ? <video src={url} controls playsInline className="max-h-full max-w-full" />
        : mime.startsWith('audio/') ? <audio src={url} controls className="w-full max-w-md" />
        : <div className="max-w-xs rounded-2xl bg-white p-6 text-center"><span className="ms text-[44px] text-primary">description</span><p className="mt-2 text-sm text-slate-700">Ce type de document ne peut pas s'afficher ici. Téléchargez-le pour l'ouvrir.</p></div>}</div></div>);
}
