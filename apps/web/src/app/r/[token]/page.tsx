'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import CandidateFlow from '@/components/CandidateFlow';
import { api, API, getDeviceId } from '@/lib/api';

/** Environnement candidat isolé : aucun compte, aucune navigation recruteur. */
export default function Public() {
  const { token } = useParams<{ token: string }>();
  const [r, setR] = useState<any>(null); const [gone, setGone] = useState(false);
  useEffect(() => { api(`/public/r/${token}`).then(setR).catch(() => setGone(true)); }, [token]);
  if (gone) return <main className="mx-auto max-w-md px-5 py-20 text-center"><h1 className="font-head text-xl font-bold">Ce recrutement n'est pas disponible</h1></main>;
  if (!r) return <main className="p-10 text-center text-sm text-muted">Chargement…</main>;
  return <CandidateFlow title={r.title} description={r.description} sections={r.sections} posterUrl={r.posterUrl} pdfUrl={r.pdfUrl} pdfDownloadUrl={r.pdfDownloadUrl} pdfName={r.pdfName}
    onUpload={(fieldKey, file, onProgress) => new Promise((resolve, reject) => {
      const fd = new FormData(); fd.append('fieldKey', fieldKey); fd.append('file', file);
      const x = new XMLHttpRequest(); x.open('POST', `${API}/public/r/${token}/upload`); x.timeout = 120_000;
      x.setRequestHeader('X-Device-Id', getDeviceId());
      x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
      x.onload = () => { let j: any = {}; try { j = JSON.parse(x.responseText); } catch { /* réponse non JSON */ }
        x.status >= 200 && x.status < 300 ? resolve(j) : reject(new Error(x.status === 429 ? 'Trop d\'envois en peu de temps. Patientez quelques minutes.' : (Array.isArray(j.message) ? j.message[0] : j.message) ?? 'Envoi impossible. Réessayez.')); };
      x.onerror = () => reject(new Error('Impossible de joindre le serveur pour l\'envoi du fichier. Réessayez dans un instant.'));
      x.ontimeout = () => reject(new Error('Le réseau est trop lent. Réessayez, ou choisissez un fichier plus léger.'));
      x.send(fd); })}
    onSubmit={async (answers) => {
      const key = `kibar.sub_${token}`;
      const subCount = Number(localStorage.getItem(key) || 0);
      if (subCount >= 2) throw new Error('Vous avez déjà soumis le nombre maximal autorisé de 2 candidatures pour ce recrutement depuis cet appareil.');
      const res = await api<{ reference: string }>(`/public/r/${token}/apply`, {
        method: 'POST',
        body: JSON.stringify({ answers, deviceId: getDeviceId() }),
      });
      localStorage.setItem(key, String(subCount + 1));
      return res;
    }} />;
}
