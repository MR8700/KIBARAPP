import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './api';
import { authApi } from './session';

type Session = { accessToken: string; refreshToken: string; recoveryCodes?: string[] };
const save = (s: Session) => { sessionStorage.setItem('kibar.access', s.accessToken); localStorage.setItem('kibar.refresh', s.refreshToken); return s; };

/** Première inscription : l'appareil crée la passkey. Aucun mot de passe. */
export async function enroll(displayName: string): Promise<Session> {
  const { userId, options } = await api<{ userId: string; options: any }>('/auth/register/options', { method: 'POST', body: JSON.stringify({ displayName }) });
  const opts = (options?.optionsJSON ?? options) as any;
  const response = await startRegistration(opts);
  return save(await api<Session>('/auth/register/verify', { method: 'POST', body: JSON.stringify({ userId, response, deviceName: navigator.platform || 'Appareil', platform: 'web' }) }));
}
/** Retour utilisateur : preuve cryptographique via la passkey (biométrie gérée par l'OS). */
export async function login(): Promise<Session> {
  const { challengeId, options } = await api<{ challengeId: string; options: any }>('/auth/login/options', { method: 'POST' });
  const opts = (options?.optionsJSON ?? options) as any;
  const response = await startAuthentication(opts);
  return save(await api<Session>('/auth/login/verify', { method: 'POST', body: JSON.stringify({ challengeId, response }) }));
}
/** Appareil perdu : un code de secours (usage unique) autorise l'enrôlement d'un nouvel appareil. */
export async function recover(code: string, revokeOthers: boolean): Promise<Session> {
  const { userId, options } = await api<{ userId: string; options: any }>('/auth/recover/start', { method: 'POST', body: JSON.stringify({ code: code.trim(), revokeOthers }) });
  const opts = (options?.optionsJSON ?? options) as any;
  const response = await startRegistration(opts);
  return save(await api<Session>('/auth/register/verify', { method: 'POST', body: JSON.stringify({ userId, response, deviceName: navigator.platform || 'Appareil', platform: 'web' }) }));
}
/** Déconnexion de cet appareil (la passkey reste valable : on peut se reconnecter). */
export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }, sessionStorage.getItem('kibar.access') ?? ''); } catch { /* session déjà expirée */ }
  sessionStorage.removeItem('kibar.access'); localStorage.removeItem('kibar.refresh'); localStorage.removeItem('kibar.org');
}

/** Confirmation biométrique (empreinte, visage ou code de l'appareil) avant une action sensible : renvoie un jeton valable 2 min. */
export async function stepUp(): Promise<string> {
  const { challengeId, options } = await authApi<{ challengeId: string; options: any }>('/auth/step-up/options', { method: 'POST' });
  const opts = (options?.optionsJSON ?? options) as any;
  const response = await startAuthentication(opts);
  return (await authApi<{ stepUpToken: string }>('/auth/step-up/verify', { method: 'POST', body: JSON.stringify({ challengeId, response }) })).stepUpToken;
}
/** Appel authentifié d'une action sensible, précédé de la confirmation biométrique. */
export async function sensitive<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tok = await stepUp();
  return authApi<T>(path, { ...init, headers: { ...(init.headers as Record<string, string>), 'X-Step-Up': tok } });
}
/** Ajoute un appareil au compte connecté (ex. un autre téléphone via QR code proposé par le navigateur) — sans consommer de code de secours. */
export async function addDevice(): Promise<{ id: string; name: string }> {
  const options = await sensitive<any>('/auth/devices/options', { method: 'POST' });
  const opts = (options?.optionsJSON ?? options) as any;
  const response = await startRegistration(opts);
  return authApi('/auth/devices/verify', { method: 'POST', body: JSON.stringify({ response, deviceName: 'Nouvel appareil', platform: 'web' }) });
}
