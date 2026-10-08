import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { VirtualAuthenticator } from './virtual-authenticator';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const db = new PrismaClient();
const tag = randomUUID().slice(0, 8);
const userIds: string[] = [];

async function call(method: string, path: string, token?: string, body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json: any; try { json = JSON.parse(text); } catch { /* vide */ }
  return { status: r.status, json };
}
async function enroll(name: string, auth: VirtualAuthenticator) {
  const o = await call('POST', '/auth/register/options', undefined, { displayName: `E2E ${name} ${tag}` });
  expect(o.status).toBe(201);
  userIds.push(o.json.userId);
  const v = await call('POST', '/auth/register/verify', undefined, { userId: o.json.userId, response: auth.create(o.json.options.challenge), deviceName: `Tel ${name}`, platform: 'web' });
  return { userId: o.json.userId as string, ...v };
}
/** Confirmation biométrique : renvoie l'en-tête X-Step-Up pour les actions sensibles. */
async function step(token: string, auth: VirtualAuthenticator) {
  const o = await call('POST', '/auth/step-up/options', token);
  const v = await call('POST', '/auth/step-up/verify', token, { challengeId: o.json.challengeId, response: auth.get(o.json.options.challenge) });
  expect(v.status).toBe(200);
  return { 'X-Step-Up': v.json.stepUpToken as string };
}
async function login(auth: VirtualAuthenticator) {
  const o = await call('POST', '/auth/login/options');
  const v = await call('POST', '/auth/login/verify', undefined, { challengeId: o.json.challengeId, response: auth.get(o.json.options.challenge) });
  return { challengeId: o.json.challengeId as string, challenge: o.json.options.challenge as string, ...v };
}

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } }); // Device/Credential/Session/RecoveryCode en cascade
  await db.$disconnect();
});

describe('auth device-bound (passkeys WebAuthn simulées)', () => {
  const A = new VirtualAuthenticator(), B = new VirtualAuthenticator();
  let userId = '', tokA = '', refA = '', codes: string[] = [];

  it('inscription : preuve valide → session + 8 codes de secours', async () => {
    const e = await enroll('A', A);
    expect(e.status).toBe(201);
    expect(e.json.accessToken && e.json.refreshToken).toBeTruthy();
    expect(e.json.recoveryCodes).toHaveLength(8);
    ({ userId } = e); tokA = e.json.accessToken; refA = e.json.refreshToken; codes = e.json.recoveryCodes;
    const u = await db.user.findUnique({ where: { id: userId } });
    expect(u?.status).toBe('ACTIVE');
  });

  it('inscription : preuve falsifiée ou challenge rejoué refusés', async () => {
    const o = await call('POST', '/auth/register/options', undefined, { displayName: `E2E bad ${tag}` });
    userIds.push(o.json.userId);
    const forged = new VirtualAuthenticator().create('mauvais-challenge');
    expect((await call('POST', '/auth/register/verify', undefined, { userId: o.json.userId, response: forged })).status).toBe(401);
    // le challenge est à usage unique : même une preuve correcte est refusée ensuite
    const good = new VirtualAuthenticator().create(o.json.options.challenge);
    expect((await call('POST', '/auth/register/verify', undefined, { userId: o.json.userId, response: good })).status).toBe(400);
  });

  it('connexion par passkey ; challenge à usage unique (anti-replay) ; mauvais appareil refusé', async () => {
    const l = await login(A);
    expect(l.status).toBe(200);
    expect(l.json.accessToken).toBeTruthy();
    const replay = await call('POST', '/auth/login/verify', undefined, { challengeId: l.challengeId, response: A.get(l.challenge) });
    expect(replay.status).toBe(401);
    expect((await login(new VirtualAuthenticator())).status).toBe(401); // credential inconnu
    const cred = await db.credential.findFirst({ where: { userId } });
    expect(cred!.signCount).toBeGreaterThan(0); // compteur avancé
  });

  it('refresh rotatif : l\'ancien refresh ne sert qu\'une fois', async () => {
    const r1 = await call('POST', '/auth/refresh', undefined, { refreshToken: refA });
    expect(r1.status).toBe(200);
    expect((await call('POST', '/auth/refresh', undefined, { refreshToken: refA })).status).toBe(401);
    expect((await call('GET', '/auth/devices', tokA)).status).toBe(401); // session de l'ancien access révoquée par la rotation
    tokA = r1.json.accessToken; refA = r1.json.refreshToken;
    expect((await call('GET', '/auth/devices', tokA)).status).toBe(200);
  });

  let tokB = '', deviceAId = '';
  it('récupération par code : nouvel appareil, anciens conservés (revokeOthers=false), code à usage unique', async () => {
    const s = await call('POST', '/auth/recover/start', undefined, { code: codes[0].toLowerCase(), revokeOthers: false });
    expect(s.status).toBe(200);
    expect(s.json.userId).toBe(userId);
    const v = await call('POST', '/auth/register/verify', undefined, { userId, response: B.create(s.json.options.challenge), deviceName: 'Tel B', platform: 'web' });
    expect(v.status).toBe(201);
    expect(v.json.recoveryCodes).toBeUndefined(); // pas de nouveaux codes sur une simple récupération
    tokB = v.json.accessToken;
    expect((await call('POST', '/auth/recover/start', undefined, { code: codes[0], revokeOthers: false })).status).toBe(401);
    expect((await call('POST', '/auth/recover/start', undefined, { code: 'AAAAA-BBBBB-CCCCC-DDDDD' })).status).toBe(401);
    const devs = await call('GET', '/auth/devices', tokB);
    expect(devs.json).toHaveLength(2);
    expect(devs.json.filter((d: any) => d.current)).toHaveLength(1);
    deviceAId = devs.json.find((d: any) => !d.current).id;
  });

  it('révocation d\'un appareil : ses sessions, refresh et passkey cessent de fonctionner', async () => {
    expect((await call('DELETE', `/auth/devices/${deviceAId}`, tokB)).status).toBe(403); // sans confirmation biométrique
    expect((await call('DELETE', `/auth/devices/${deviceAId}`, tokB, undefined, await step(tokB, B))).status).toBe(204);
    expect((await call('GET', '/auth/devices', tokA)).status).toBe(401);
    expect((await call('POST', '/auth/refresh', undefined, { refreshToken: refA })).status).toBe(401);
    expect((await login(A)).status).toBe(401);
    expect((await login(B)).status).toBe(200);
    expect((await call('DELETE', `/auth/devices/${deviceAId}`, tokB, undefined, await step(tokB, B))).status).toBe(400); // déjà révoqué
  });

  it('un utilisateur ne peut pas révoquer l\'appareil d\'un autre', async () => {
    const C = new VirtualAuthenticator();
    const other = await enroll('C', C);
    const devs = await call('GET', '/auth/devices', other.json.accessToken);
    expect((await call('DELETE', `/auth/devices/${devs.json[0].id}`, tokB, undefined, await step(tokB, B))).status).toBe(400);
  });

  it('régénération des codes : les anciens sont invalidés', async () => {
    expect((await call('POST', '/auth/recovery-codes', tokB)).status).toBe(403);
    const r = await call('POST', '/auth/recovery-codes', tokB, undefined, await step(tokB, B));
    expect(r.status).toBe(201);
    expect(r.json.codes).toHaveLength(8);
    expect((await call('POST', '/auth/recover/start', undefined, { code: codes[1], revokeOthers: false })).status).toBe(401);
  });

  it('récupération avec revokeOthers : tous les autres appareils sont révoqués', async () => {
    const D = new VirtualAuthenticator();
    const code = (await call('POST', '/auth/recovery-codes', tokB, undefined, await step(tokB, B))).json.codes[0];
    const s = await call('POST', '/auth/recover/start', undefined, { code, revokeOthers: true });
    expect(s.status).toBe(200);
    expect((await call('GET', '/auth/devices', tokB)).status).toBe(200); // rien n'est révoqué tant que le nouvel appareil n'est pas enrôlé
    const v = await call('POST', '/auth/register/verify', undefined, { userId, response: D.create(s.json.options.challenge), deviceName: 'Tel D' });
    expect(v.status).toBe(201);
    expect((await call('GET', '/auth/devices', tokB)).status).toBe(401); // B révoqué à l'enrôlement
    const devs = await call('GET', '/auth/devices', v.json.accessToken);
    expect(devs.json).toHaveLength(1);
  });

  it('récupération ratée : le code n\'est pas consommé et personne n\'est révoqué', async () => {
    const F = new VirtualAuthenticator(), F2 = new VirtualAuthenticator();
    const f = await enroll('F', F);
    const code = f.json.recoveryCodes[0];
    const s = await call('POST', '/auth/recover/start', undefined, { code, revokeOthers: true });
    const bad = await call('POST', '/auth/register/verify', undefined, { userId: f.userId, response: F2.create('mauvais-challenge'), deviceName: 'X' });
    expect(bad.status).toBe(401);
    expect((await call('GET', '/auth/devices', f.json.accessToken)).status).toBe(200);
    const again = await call('POST', '/auth/recover/start', undefined, { code, revokeOthers: true }); // le même code resert
    expect(again.status).toBe(200);
    expect(s.status).toBe(200);
  });

  it('biométrie exigée : un appareil sans vérification utilisateur est refusé', async () => {
    const N = new VirtualAuthenticator(undefined, undefined, false);
    const o = await call('POST', '/auth/register/options', undefined, { displayName: `E2E N ${tag}` });
    userIds.push(o.json.userId);
    expect((await call('POST', '/auth/register/verify', undefined, { userId: o.json.userId, response: N.create(o.json.options.challenge) })).status).toBe(401);
  });

  it('ajout d\'un appareil depuis un compte connecté : confirmation requise, aucun code consommé', async () => {
    const G = new VirtualAuthenticator(), G2 = new VirtualAuthenticator();
    const g = await enroll('G', G); const tok = g.json.accessToken;
    expect((await call('POST', '/auth/devices/options', tok)).status).toBe(403);
    const o = await call('POST', '/auth/devices/options', tok, undefined, await step(tok, G));
    expect(o.status).toBe(200);
    const v = await call('POST', '/auth/devices/verify', tok, { response: G2.create(o.json.challenge), deviceName: 'Tel G2' });
    expect(v.status).toBe(201);
    expect((await call('GET', '/auth/devices', tok)).json).toHaveLength(2);
    expect((await login(G2)).status).toBe(200);
  });

  it('un jeton de confirmation ne sert pas de jeton d\'accès ni à une autre session', async () => {
    const H = new VirtualAuthenticator(); const h = await enroll('H', H);
    const stepTok = (await step(h.json.accessToken, H))['X-Step-Up'];
    expect((await call('GET', '/auth/devices', stepTok)).status).toBe(401);
    const other = await login(H); // autre session
    expect((await call('POST', '/auth/recovery-codes', other.json.accessToken, undefined, { 'X-Step-Up': stepTok })).status).toBe(403);
  });

  it('déconnexion, audit', async () => {
    const E = new VirtualAuthenticator();
    const e = await enroll('E', E);
    expect((await call('POST', '/auth/logout', e.json.accessToken)).status).toBe(204);
    expect((await call('GET', '/auth/devices', e.json.accessToken)).status).toBe(401);
    const actions = (await db.auditLog.findMany({ where: { userId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.enroll', 'auth.login', 'auth.recover.start', 'auth.recover.enroll', 'auth.device.revoke']));
  });
});
