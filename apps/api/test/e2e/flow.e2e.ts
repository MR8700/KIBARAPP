import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const db = new PrismaClient();
const jwt = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev-only-secret' });
const tag = randomUUID().slice(0, 8);

type U = { id: string; token: string };
const users: string[] = [], orgs: string[] = [];

/** Utilisateur + appareil + session directement en base, jeton signé avec le secret de l'API (les passkeys ne sont pas rejouables en test). */
async function seedUser(name: string, orgId?: string, role?: 'ADMIN' | 'RECRUTEUR' | 'CONSULTANT'): Promise<U> {
  const u = await db.user.create({ data: { publicId: `e2e-${tag}-${name}`, displayName: `E2E ${name}`, status: 'ACTIVE' } });
  const d = await db.device.create({ data: { userId: u.id, devicePublicId: `dev-${tag}-${name}`, deviceName: 'e2e', platform: 'test' } });
  const s = await db.session.create({ data: { userId: u.id, deviceId: d.id, refreshHash: `rh-${tag}-${name}`, expiresAt: new Date(Date.now() + 3600_000) } });
  if (orgId && role) await db.organizationMember.create({ data: { userId: u.id, orgId, role } });
  users.push(u.id);
  return { id: u.id, token: await jwt.signAsync({ sub: u.id, sid: s.id }, { expiresIn: '15m' }) };
}
async function call(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  let json: any; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binaire ou texte */ }
  return { status: r.status, json, buf, headers: r.headers };
}
/** Client WebSocket : file d'événements + attente d'un événement précis (avec délai). */
async function connect(orgId: string, token: string) {
  const ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws', { origin: ORIGIN });
  const msgs: any[] = []; const waiters: (() => void)[] = []; let closed: number | null = null;
  ws.on('message', (m) => { msgs.push(JSON.parse(m.toString())); waiters.splice(0).forEach((w) => w()); });
  ws.on('close', (code) => { closed = code; waiters.splice(0).forEach((w) => w()); });
  await new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
  ws.send(JSON.stringify({ type: 'auth', token, orgId }));
  const waitFor = async (pred: (m: any) => boolean, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = msgs.findIndex(pred); if (i >= 0) return msgs.splice(i, 1)[0];
      if (closed !== null) throw new Error('socket fermé : ' + closed);
      const left = end - Date.now(); if (left <= 0) throw new Error('délai dépassé en attendant un événement');
      await new Promise<void>((r) => { waiters.push(r); setTimeout(r, left); });
    }
  };
  const closeCode = async (ms = 5000) => { const end = Date.now() + ms; while (closed === null && Date.now() < end) await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 100); }); return closed; };
  return { ws, waitFor, closeCode };
}

describe('parcours complet : candidature → notification → retenu → export', () => {
  let admin: U, consultant: U, outsider: U; let org = '', rid = '', publicToken = '', appId = '';

  beforeAll(async () => {
    const o = await db.organization.create({ data: { name: `E2E Org ${tag}` } }); org = o.id; orgs.push(o.id);
    const o2 = await db.organization.create({ data: { name: `E2E Autre ${tag}` } }); orgs.push(o2.id);
    admin = await seedUser('admin', org, 'ADMIN'); consultant = await seedUser('consultant', org, 'CONSULTANT'); outsider = await seedUser('outsider', o2.id, 'ADMIN');
    publicToken = `e2e${tag}${randomUUID().replace(/-/g, '')}`;
    const rec = await db.recruitment.create({ data: { orgId: org, publicToken, title: `Recrutement E2E ${tag}`, status: 'ACTIVE', createdBy: admin.id } }); rid = rec.id;
    const sec = await db.recruitmentSection.create({ data: { recruitmentId: rid, title: 'Infos', position: 0 } });
    await db.formField.create({ data: { recruitmentId: rid, sectionId: sec.id, key: 'nom', type: 'text', label: 'Nom', required: true, position: 0 } });
    await db.formField.create({ data: { recruitmentId: rid, sectionId: sec.id, key: 'ville', type: 'single', label: 'Ville', position: 1, options: { create: [{ label: 'Ouagadougou', value: 'ouaga', position: 0 }, { label: 'Bobo-Dioulasso', value: 'bobo', position: 1 }] } } });
  });
  afterAll(async () => {
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.auditLog.deleteMany({ where: { orgId: { in: orgs } } });
    await db.organization.deleteMany({ where: { id: { in: orgs } } }); // cascade : membres, recrutements, candidatures
    await db.user.deleteMany({ where: { id: { in: users } } });     // cascade : appareils, sessions
    await db.$disconnect();
  });

  it('un candidat postule, le recruteur est notifié en direct', async () => {
    const live = await connect(org, admin.token); await live.waitFor((m) => m.type === 'ready');
    const r = await call('POST', `/public/r/${publicToken}/apply`, undefined, { answers: { nom: 'Awa Traoré', ville: 'ouaga' } });
    expect(r.status).toBe(201); expect(r.json.reference).toMatch(/^CAND-\d{4}-\d{6}$/);
    const ev = await live.waitFor((m) => m.type === 'application.new');
    expect(ev.recruitmentId).toBe(rid); expect(ev.reference).toBe(r.json.reference); expect(JSON.stringify(ev)).not.toContain('Awa'); // aucune donnée personnelle sur le fil
    const n = await call('GET', '/notifications', admin.token);
    expect(n.json.unread).toBe(1); expect(n.json.items[0].payload.reference).toBe(r.json.reference);
    expect((await call('GET', '/notifications', consultant.token)).json.unread).toBe(0); // le consultant n'est pas notifié
    live.ws.close();
  });

  it('isolation : un tiers ne voit rien et ne peut pas écouter', async () => {
    expect((await call('GET', `/orgs/${org}/recruitments/${rid}/applications`, outsider.token)).status).toBe(403);
    expect((await call('GET', `/orgs/${org}/recruitments/${rid}/stats`, outsider.token)).status).toBe(403);
    expect((await call('GET', `/orgs/${org}/audit`, outsider.token)).status).toBe(403);
    const spy = await connect(org, outsider.token); expect(await spy.closeCode()).toBe(4403);
    expect((await call('GET', `/orgs/${org}/recruitments/${rid}/applications`)).status).toBe(401);
  });

  it('recherche avec filtre, puis retenu en masse diffusé aux autres écrans', async () => {
    const base = `/orgs/${org}/recruitments/${rid}/applications`;
    const all = await call('POST', `${base}/search`, admin.token, {}); expect(all.json.total).toBe(1); appId = all.json.items[0].id;
    const f = (v: string) => ({ filter: { op: 'AND', children: [{ field: 'ville', operator: 'is', value: v }] } });
    expect((await call('POST', `${base}/search`, admin.token, f('ouaga'))).json.total).toBe(1);
    expect((await call('POST', `${base}/search`, admin.token, f('bobo'))).json.total).toBe(0);
    expect((await call('POST', `${base}/bulk-status`, consultant.token, { ids: [appId], status: 'SELECTED' })).status).toBe(403);
    const live = await connect(org, consultant.token); await live.waitFor((m) => m.type === 'ready');
    expect((await call('POST', `${base}/bulk-status`, admin.token, { ids: [appId], status: 'SELECTED' })).status).toBe(201);
    const ev = await live.waitFor((m) => m.type === 'application.status'); expect(ev).toMatchObject({ recruitmentId: rid, status: 'SELECTED', ids: [appId] });
    live.ws.close();
  });

  it('espace Retenus : colonnes enregistrées, libellés d\'options, droits', async () => {
    const base = `/orgs/${org}/recruitments/${rid}/selected`;
    const v = await call('GET', base, consultant.token);
    expect(v.json.total).toBe(1); expect(v.json.canEdit).toBe(false); expect(v.json.rows[0].cells.ville).toBe('Ouagadougou');
    const cols = [{ key: 'ville', visible: true }, { key: 'nom', visible: true }, { key: 'reference', visible: false }, { key: 'selectedAt', visible: false }, { key: 'submittedAt', visible: false }];
    expect((await call('PUT', `${base}/config`, consultant.token, { columns: cols })).status).toBe(403);
    expect((await call('PUT', `${base}/config`, admin.token, { columns: cols.map((c) => ({ ...c, visible: false })) })).status).toBe(400); // au moins une colonne
    expect((await call('PUT', `${base}/config`, admin.token, { columns: cols })).status).toBe(200);
    const again = await call('GET', base, admin.token);
    expect(again.json.canEdit).toBe(true); expect(again.json.columns.map((c: any) => c.key).slice(0, 2)).toEqual(['ville', 'nom']); expect(again.json.columns[0].visible).toBe(true);
  });

  it('exports Excel, PDF et CSV conformes aux colonnes enregistrées', async () => {
    const base = `/orgs/${org}/recruitments/${rid}/selected/export`;
    const x = await call('GET', `${base}?format=xlsx`, admin.token); expect(x.status).toBe(200); expect(x.buf.subarray(0, 2).toString()).toBe('PK'); // zip OOXML
    expect(x.headers.get('content-disposition')).toContain('.xlsx');
    const p = await call('GET', `${base}?format=pdf`, admin.token); expect(p.status).toBe(200); expect(p.buf.subarray(0, 4).toString()).toBe('%PDF');
    const c = await call('GET', `${base}?format=csv`, admin.token); expect(c.status).toBe(200);
    const text = c.buf.toString('utf8'); expect(text.charCodeAt(0)).toBe(0xfeff); expect(text).toContain('Awa Traoré'); expect(text).toContain('Ouagadougou');
    expect(text.split('\r\n')[0]).toBe('\uFEFFVille,Nom'); // ordre enregistré
    expect((await call('GET', `${base}?format=xlsx`, consultant.token)).status).toBe(403);
    expect((await call('GET', `${base}?format=exe`, admin.token)).status).toBe(400);
  });

  it('statistiques et journal d\'audit', async () => {
    const s = await call('GET', `/orgs/${org}/recruitments/${rid}/stats`, consultant.token);
    expect(s.json.total).toBe(1); expect(s.json.counts.SELECTED).toBe(1); expect(s.json.selectedRate).toBe(100);
    expect(s.json.distributions[0].items[0]).toEqual({ label: 'Ouagadougou', count: 1 });
    const a = await call('GET', `/orgs/${org}/audit`, admin.token);
    const actions = a.json.items.map((i: any) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['application.bulk_status', 'selected.config', 'selected.export']));
    expect((await call('GET', `/orgs/${org}/audit`, consultant.token)).status).toBe(403);
  });
});
