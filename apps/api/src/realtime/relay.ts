/** Relais multi-instances du temps réel : sans bus (REDIS_URL absent) tout reste local ; avec bus, chaque instance diffuse à ses propres clients. */
export interface Bus { publish(msg: string): Promise<void>; onMessage(cb: (msg: string) => void): void; close(): void }

const TYPES = new Set(['application.new', 'application.status', 'application.deleted']);
export const encode = (orgId: string, ev: unknown) => JSON.stringify({ orgId, ev });
export function decode<E extends { type: string }>(raw: string): { orgId: string; ev: E } | null {
  try {
    const m = JSON.parse(raw);
    return typeof m?.orgId === 'string' && typeof m?.ev?.type === 'string' && TYPES.has(m.ev.type) ? { orgId: m.orgId, ev: m.ev } : null;
  } catch { return null; }
}

export class Relay<E extends { type: string }> {
  constructor(private bus: Bus | null, private deliver: (orgId: string, ev: E) => void) {
    bus?.onMessage((raw) => { const m = decode<E>(raw); if (m) deliver(m.orgId, m.ev); });
  }
  /** Avec bus : on publie, et c'est la réception (y compris de soi-même) qui diffuse → pas de doublon. Bus en panne : diffusion locale. */
  async publish(orgId: string, ev: E) {
    if (!this.bus) return this.deliver(orgId, ev);
    try { await this.bus.publish(encode(orgId, ev)); } catch { this.deliver(orgId, ev); }
  }
  close() { this.bus?.close(); }
}
