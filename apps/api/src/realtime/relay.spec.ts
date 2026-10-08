import { describe, expect, it } from 'vitest';
import { Bus, Relay, decode, encode } from './relay';

const ev = { type: 'application.new' as const, recruitmentId: 'r' };
/** Bus mémoire partagé entre « instances » : reproduit le comportement de Redis pub/sub. */
function shared() { const subs: ((m: string) => void)[] = []; const mk = (fail = false): Bus => ({ publish: async (m) => { if (fail) throw new Error('down'); subs.forEach((s) => s(m)); }, onMessage: (cb) => subs.push(cb), close() {} }); return mk; }

describe('relais temps réel', () => {
  it('sans bus : diffusion locale directe', async () => {
    const got: string[] = []; await new Relay(null, (o) => got.push(o)).publish('org1', ev); expect(got).toEqual(['org1']);
  });
  it('avec bus : chaque instance livre une seule fois, y compris l\'émettrice', async () => {
    const mk = shared(); const a: string[] = [], b: string[] = [];
    const ra = new Relay(mk(), (o) => a.push(o)); new Relay(mk(), (o) => b.push(o));
    await ra.publish('org1', ev); expect(a).toEqual(['org1']); expect(b).toEqual(['org1']);
  });
  it('bus en panne : repli sur la diffusion locale', async () => {
    const mk = shared(); const got: string[] = []; await new Relay(mk(true), (o) => got.push(o)).publish('org1', ev); expect(got).toEqual(['org1']);
  });
  it('rejette les messages malformés ou de type inconnu', () => {
    expect(decode('pas du json')).toBeNull(); expect(decode(encode('o', { type: 'evil' }))).toBeNull(); expect(decode(encode('o', ev))).not.toBeNull();
  });
});
