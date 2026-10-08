'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/session';
import { ASTATUS, fmt, show } from '@/lib/apps';
import FileViewer from '@/components/FileViewer';
import { emitStateChange, invalidateCache } from '@/lib/cache';
import BottomNav from '@/components/BottomNav';
import FluidBackground from '@/components/FluidBackground';

function Dossier() {
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const org = useSearchParams().get('org') ?? '';
  const [view, setView] = useState<{ url: string; name: string; mime: string } | null>(null);
  const router = useRouter();
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [a, setA] = useState<any>(null);
  const [err, setErr] = useState('');
  const base = `/orgs/${org}/recruitments/${id}/applications/${appId}`;

  const load = () =>
    authApi<any>(base)
      .then(setA)
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
  }, [base]);

  async function remove() {
    setDeleting(true);
    setErr('');
    try {
      await authApi(base, { method: 'DELETE' });
      invalidateCache(`apps_${id}`);
      invalidateCache(`counts_${id}`);
      invalidateCache(`recs_${org}`);
      emitStateChange('recruitment.updated');
      router.replace(`/app/recruitments/${id}/applications?org=${org}`);
    } catch (e: any) {
      setErr(e.message);
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  const mo = (n: number) =>
    n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

  async function open(f: any, download: boolean) {
    setErr('');
    try {
      const r = await authApi<{ url: string; name: string; mime: string }>(
        `${base}/files/${f.id}${download ? '?download=1' : ''}`
      );
      if (download) {
        const l = document.createElement('a');
        l.href = r.url;
        l.download = r.name;
        l.rel = 'noopener';
        document.body.appendChild(l);
        l.click();
        l.remove();
      } else {
        setView(r);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function set(status: string) {
    try {
      await authApi(`${base}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      invalidateCache(`apps_${id}`);
      invalidateCache(`counts_${id}`);
      invalidateCache(`recs_${org}`);
      emitStateChange('recruitment.updated');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (!a) return <main className="p-10 text-center text-sm text-muted">{err || 'Chargement…'}</main>;

  const s = ASTATUS[a.status];

  return (
    <>
      <FluidBackground />
      <main className="relative z-10 mx-auto max-w-md px-5 pb-36 pt-6">
      <Link
        href={`/app/recruitments/${id}/applications?org=${org}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
      >
        <span className="ms text-[18px]">arrow_back</span>Candidatures
      </Link>

      <div className="card-k mt-4 !p-4">
        <span className="text-xs font-semibold text-slate-500">Numéro de référence</span>
        <h1 className="mt-1 font-mono text-xl font-extrabold text-slate-900">{a.reference}</h1>
        <div className="mt-2">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${s.cls}`}>
            {s.label}
          </span>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-error">{err}</p>}

      <div className="mt-5 space-y-3">
        {a.answers.map((r: any) => (
          <div key={r.id} className="card-k !p-3.5">
            <p className="text-xs font-semibold text-slate-500">{r.field.label}</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-900">{show(r.value)}</p>
          </div>
        ))}
      </div>

      {a.files?.length > 0 && (
        <>
          <h2 className="mb-3 mt-7 font-head text-base font-bold text-slate-900">
            Documents joints ({a.files.length})
          </h2>
          <div className="space-y-2">
            {a.files.map((f: any) => {
              const ok = f.scanStatus === 'CLEAN';
              const st = ok
                ? null
                : f.scanStatus === 'PENDING'
                ? ['Vérification en cours…', 'text-amber-600']
                : f.scanStatus === 'INFECTED'
                ? ["Bloqué par l'antivirus", 'text-red-600']
                : ['Indisponible', 'text-slate-500'];
              const icon = f.mime.startsWith('image/')
                ? 'image'
                : f.mime === 'application/pdf'
                ? 'picture_as_pdf'
                : f.mime.startsWith('video/')
                ? 'movie'
                : f.mime.startsWith('audio/')
                ? 'audio_file'
                : 'description';

              return (
                <div key={f.id} className="card-k flex items-center gap-3 !p-3">
                  <button
                    disabled={!ok}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
                    onClick={() => open(f, false)}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <span className="ms text-[24px]">{icon}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">{f.name}</span>
                      <span className={`block text-xs ${st ? st[1] : 'text-slate-500'}`}>
                        {st ? st[0] : mo(f.size)}
                      </span>
                    </span>
                  </button>
                  <button
                    disabled={!ok}
                    aria-label={`Télécharger ${f.name}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition"
                    onClick={() => open(f, true)}
                  >
                    <span className="ms text-[20px]">download</span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view && (
        <FileViewer
          {...view}
          onClose={() => setView(null)}
          onDownload={() => {
            const f = a.files.find((x: any) => x.name === view.name);
            if (f) void open(f, true);
          }}
        />
      )}

      <h2 className="mb-3 mt-7 font-head text-base font-bold text-slate-900">Historique</h2>
      <ol className="space-y-2.5 border-l-2 border-slate-200 pl-4">
        {[...a.history].map((h: any) => (
          <li key={h.id} className="text-sm">
            <span className="font-semibold text-slate-900">{ASTATUS[h.status]?.label}</span>{' '}
            <span className="text-xs text-slate-500">{fmt(h.at)}</span>
          </li>
        ))}
      </ol>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200/80 bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md gap-2">
          <button
            className="btn flex-1 !bg-emerald-600 hover:!bg-emerald-700 !px-3 !py-2.5 text-xs shadow-emerald-500/20"
            onClick={() => set('SELECTED')}
          >
            Retenir
          </button>
          <button
            className="btn flex-1 !bg-rose-600 hover:!bg-rose-700 !px-3 !py-2.5 text-xs shadow-rose-500/20"
            onClick={() => set('REJECTED')}
          >
            Écarter
          </button>
          <button
            className="btn-secondary flex-1 !px-3 !py-2.5 text-xs"
            onClick={() => set('WAITING')}
          >
            Attente
          </button>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-md pb-10">
        {!confirmDel ? (
          <button
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 transition"
            onClick={() => setConfirmDel(true)}
          >
            <span className="ms text-[18px]">delete</span>Supprimer cette candidature
          </button>
        ) : (
          <div role="alertdialog" className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-800">
              Supprimer définitivement cette candidature et ses fichiers ?
            </p>
            <p className="mt-1 text-xs text-red-700">Cette action est irréversible.</p>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-secondary min-h-[44px] flex-1 text-sm font-semibold"
                disabled={deleting}
                onClick={() => setConfirmDel(false)}
              >
                Annuler
              </button>
              <button
                className="min-h-[44px] flex-1 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 transition"
                disabled={deleting}
                onClick={() => void remove()}
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>

    <BottomNav
      variant="cand"
      active="cand"
      candidaturesHref={`/app/recruitments/${id}/applications?org=${org}`}
      selectedHref={`/app/recruitments/${id}/selected?org=${org}`}
      statsHref={`/app/recruitments/${id}/stats?org=${org}`}
    />
  </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-center text-sm text-muted">Chargement…</main>}>
      <Dossier />
    </Suspense>
  );
}
