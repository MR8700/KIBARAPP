import { api, API } from './api';

/** Appel authentifié : renouvelle l'accès via le refresh rotatif sur 401, sinon renvoie vers /login. */
export async function authApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const call = () => api<T>(path, init, sessionStorage.getItem('kibar.access') ?? '');
  try { return await call(); } catch (e: any) {
    const refresh = localStorage.getItem('kibar.refresh');
    if (!refresh || !/token|session|autoris|unauthor/i.test(e.message)) { if (!refresh) location.href = '/login'; throw e; }
    try {
      const s = await api<{ accessToken: string; refreshToken: string }>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: refresh }) });
      sessionStorage.setItem('kibar.access', s.accessToken); localStorage.setItem('kibar.refresh', s.refreshToken);
      return await call();
    } catch { localStorage.removeItem('kibar.refresh'); location.href = '/login'; throw e; }
  }
}
/** Téléchargement authentifié (CSV…) avec renouvellement de session sur 401. */
export async function authDownload(path: string, filename: string) {
  const go = () => fetch(API + path, { headers: { Authorization: `Bearer ${sessionStorage.getItem('kibar.access') ?? ''}` } });
  let r = await go();
  if (r.status === 401) {
    const refresh = localStorage.getItem('kibar.refresh');
    if (!refresh) { location.href = '/login'; return; }
    const s = await api<{ accessToken: string; refreshToken: string }>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: refresh }) });
    sessionStorage.setItem('kibar.access', s.accessToken); localStorage.setItem('kibar.refresh', s.refreshToken); r = await go();
  }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Export impossible');
  const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
export const currentOrg = () => (typeof window !== 'undefined' ? localStorage.getItem('kibar.org') ?? '' : '');
export const setCurrentOrg = (id: string) => {
  if (typeof window !== 'undefined') localStorage.setItem('kibar.org', id);
};

export const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-600' },
  PREVIEW: { label: 'En préparation', cls: 'bg-sahel-gold/10 text-sahel-gold' },
  ACTIVE: { label: 'Actif', cls: 'bg-success/10 text-success' },
  PAUSED: { label: 'Suspendu', cls: 'bg-slate-100 text-slate-600' },
  CLOSED: { label: 'Terminé', cls: 'bg-slate-100 text-slate-600' },
  ARCHIVED: { label: 'Archivé', cls: 'bg-slate-100 text-slate-500' },
};
