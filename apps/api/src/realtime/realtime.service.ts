import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { Relay } from './relay';
import { RedisBus } from './redis.bus';

type Client = WebSocket & { orgId?: string; userId?: string; sid?: string; alive?: boolean };
/** Événements sans donnée personnelle : le client recharge via l'API (qui applique les droits). */
export type RtEvent =
  | { type: 'application.new'; recruitmentId: string; applicationId: string; reference: string; submittedAt: string }
  | { type: 'application.status'; recruitmentId: string; ids: string[]; status: string }
  | { type: 'application.deleted'; recruitmentId: string; applicationId: string };

/**
 * WebSocket /ws. Authentification par PREMIER message {type:'auth', token, orgId} (jamais dans l'URL → pas dans les logs).
 * Une « room » par organisation, membership vérifiée. Sessions revalidées toutes les 60 s (appareil révoqué = déconnexion).
 * Plusieurs instances API : définir REDIS_URL (relais pub/sub), sinon diffusion locale uniquement.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private wss?: WebSocketServer; private timer?: NodeJS.Timeout; private tick = 0;
  private rooms = new Map<string, Set<Client>>();
  private relay: Relay<RtEvent>;
  constructor(private jwt: JwtService, private db: PrismaService) {
    this.relay = new Relay<RtEvent>(process.env.REDIS_URL ? new RedisBus(process.env.REDIS_URL) : null, (o, e) => this.deliver(o, e));
  }

  attach(server: Server) {
    const allowed = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, verifyClient: (i: { origin?: string }) => i.origin === allowed });
    this.wss.on('connection', (ws: Client) => {
      ws.alive = true; ws.on('pong', () => { ws.alive = true; });
      const t = setTimeout(() => ws.close(4401, 'auth timeout'), 5000);
      ws.once('message', (raw) => { clearTimeout(t); this.auth(ws, raw.toString()).catch(() => ws.close(4401, 'auth')); });
      ws.on('close', () => { clearTimeout(t); this.leave(ws); });
      ws.on('error', () => ws.terminate());
    });
    this.timer = setInterval(() => { this.heartbeat(); if (++this.tick % 2 === 0) this.revalidate().catch(() => undefined); }, 30_000);
  }
  onModuleDestroy() { clearInterval(this.timer); this.wss?.close(); this.relay.close(); }

  private async auth(ws: Client, raw: string) {
    const m = JSON.parse(raw);
    if (m?.type !== 'auth' || typeof m.token !== 'string' || typeof m.orgId !== 'string') throw new Error('bad');
    const p = await this.jwt.verifyAsync<{ sub: string; sid: string }>(m.token);
    const s = await this.db.session.findUnique({ where: { id: p.sid }, include: { device: true } });
    if (!s || s.revokedAt || s.device.revokedAt || s.userId !== p.sub || s.expiresAt < new Date()) throw new Error('session');
    const member = await this.db.organizationMember.findUnique({ where: { userId_orgId: { userId: p.sub, orgId: m.orgId } } });
    if (!member) { ws.close(4403, 'forbidden'); return; }
    if (ws.readyState !== WebSocket.OPEN) return; // fermé pendant la vérification
    ws.orgId = m.orgId; ws.userId = p.sub; ws.sid = p.sid;
    (this.rooms.get(m.orgId) ?? this.rooms.set(m.orgId, new Set()).get(m.orgId)!).add(ws);
    ws.send('{"type":"ready"}');
  }
  private leave(ws: Client) { if (!ws.orgId) return; const r = this.rooms.get(ws.orgId); r?.delete(ws); if (r && !r.size) this.rooms.delete(ws.orgId); }

  /** Point d'entrée unique : passe par le relais (Redis si configuré) puis deliver() sur chaque instance. */
  publish(orgId: string, ev: RtEvent) { void this.relay.publish(orgId, ev); }

  private deliver(orgId: string, ev: RtEvent) {
    const msg = JSON.stringify(ev);
    for (const c of this.rooms.get(orgId) ?? []) {
      if (c.readyState !== WebSocket.OPEN) continue;
      if (c.bufferedAmount > 1_000_000) { c.terminate(); continue; } // client trop lent
      c.send(msg);
    }
  }

  private heartbeat() {
    this.wss?.clients.forEach((c: Client) => { if (!c.alive) return c.terminate(); c.alive = false; c.ping(); });
  }
  private async revalidate() {
    const all = [...this.rooms.values()].flatMap((r) => [...r]);
    if (!all.length) return;
    const [sessions, members] = await Promise.all([
      this.db.session.findMany({ where: { id: { in: [...new Set(all.map((c) => c.sid!))] } }, include: { device: true } }),
      this.db.organizationMember.findMany({ where: { OR: all.map((c) => ({ userId: c.userId!, orgId: c.orgId! })) }, select: { userId: true, orgId: true } }),
    ]);
    const okSid = new Set(sessions.filter((s) => !s.revokedAt && !s.device.revokedAt && s.expiresAt > new Date()).map((s) => s.id));
    const okMem = new Set(members.map((m) => m.userId + ':' + m.orgId));
    for (const c of all) if (!okSid.has(c.sid!) || !okMem.has(c.userId + ':' + c.orgId)) c.close(4401, 'revoked');
  }
}
