export const API = process.env.NEXT_PUBLIC_API_URL || 'https://kibar-api.onrender.com';
export async function api<T>(path: string, init: RequestInit = {}, access?: string): Promise<T> {
  const r = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}), ...init.headers } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Erreur');
  return r.status === 204 ? (undefined as T) : r.json();
}
