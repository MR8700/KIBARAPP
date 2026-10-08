export const API = process.env.NEXT_PUBLIC_API_URL || 'https://kibar-api.onrender.com';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('kibar.did');
  if (!id) {
    id = 'did_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem('kibar.did', id);
  }
  return id;
}

export async function api<T>(path: string, init: RequestInit = {}, access?: string): Promise<T> {
  const did = getDeviceId();
  const r = await fetch(API + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(did ? { 'X-Device-Id': did } : {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...init.headers,
    },
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Erreur');
  return r.status === 204 ? (undefined as T) : r.json();
}
