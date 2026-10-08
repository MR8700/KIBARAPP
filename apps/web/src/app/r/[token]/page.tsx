'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import CandidateFlow from '@/components/CandidateFlow';
import { api, API, getDeviceId } from '@/lib/api';

/** Environnement candidat isolé : aucun compte, aucune navigation recruteur. */
export default function Public() {
  const { token } = useParams<{ token: string }>();
  const [r, setR] = useState<any>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    api(`/public/r/${token}`)
      .then(setR)
      .catch(() => setGone(true));
  }, [token]);

  if (gone)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 py-20 text-center animate-[fadeup_.3s_ease-out]">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 mb-4">
          <span className="ms text-[32px]">link_off</span>
        </span>
        <h1 className="font-head text-xl font-bold text-slate-900">
          Ce recrutement n'est pas disponible
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-xs">
          Le lien est peut-être expiré, désactivé ou l'offre n'a pas encore été publiée par l'employeur.
        </p>
      </main>
    );

  if (!r)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-10 text-center animate-pulse">
        <span className="h-10 w-10 rounded-xl bg-blue-100/70 mb-3" />
        <p className="font-head text-sm font-semibold text-slate-600">Chargement de l'offre…</p>
      </main>
    );

  return (
    <CandidateFlow
      title={r.title}
      description={r.description}
      sections={r.sections}
      posterUrl={r.posterUrl}
      pdfUrl={r.pdfUrl}
      pdfDownloadUrl={r.pdfDownloadUrl}
      pdfName={r.pdfName}
      startsAt={r.startsAt}
      endsAt={r.endsAt}
      isUpcoming={r.isUpcoming}
      isExpired={r.isExpired}
      onUpload={(fieldKey, file, onProgress) =>
        new Promise((resolve, reject) => {
          const fd = new FormData();
          fd.append('fieldKey', fieldKey);
          fd.append('file', file);
          const x = new XMLHttpRequest();
          x.open('POST', `${API}/public/r/${token}/upload`);
          x.timeout = 120_000;
          x.setRequestHeader('X-Device-Id', getDeviceId());
          x.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
          };
          x.onload = () => {
            let j: any = {};
            try {
              j = JSON.parse(x.responseText);
            } catch {
              /* réponse non JSON */
            }
            x.status >= 200 && x.status < 300
              ? resolve(j)
              : reject(
                  new Error(
                    x.status === 429
                      ? "Trop d'envois en peu de temps. Patientez quelques minutes."
                      : (Array.isArray(j.message) ? j.message[0] : j.message) ??
                          "Envoi impossible. Réessayez."
                  )
                );
          };
          x.onerror = () =>
            reject(
              new Error(
                "Impossible de joindre le serveur pour l'envoi du fichier. Réessayez dans un instant."
              )
            );
          x.ontimeout = () =>
            reject(
              new Error(
                'Le réseau est trop lent. Réessayez, ou choisissez un fichier plus léger.'
              )
            );
          x.send(fd);
        })
      }
      onSubmit={async (answers) => {
        const key = `kibar.sub_${token}`;
        const subCount = Number(localStorage.getItem(key) || 0);
        if (subCount >= 2)
          throw new Error(
            'Vous avez déjà soumis le nombre maximal autorisé de 2 candidatures pour ce recrutement depuis cet appareil.'
          );
        const res = await api<{ reference: string }>(`/public/r/${token}/apply`, {
          method: 'POST',
          body: JSON.stringify({ answers, deviceId: getDeviceId() }),
        });
        localStorage.setItem(key, String(subCount + 1));
        return res;
      }}
    />
  );
}
