import { createServer } from 'net';
import { describe, expect, it } from 'vitest';
import { scanBuffer } from './clamav';

/** Faux clamd : lit le flux INSTREAM jusqu'au bloc nul, répond `reply`, et expose les octets reçus. */
function fake(reply: string) {
  return new Promise<{ port: number; got: Promise<Buffer>; close: () => void }>((res) => {
    let resolveGot!: (b: Buffer) => void; const got = new Promise<Buffer>((r) => (resolveGot = r));
    const srv = createServer((s) => {
      let b = Buffer.alloc(0);
      s.on('data', (d) => {
        b = Buffer.concat([b, d]);
        if (b.length >= 4 && b.subarray(b.length - 4).equals(Buffer.alloc(4)) && b.length > 11) { s.end(reply + '\0'); resolveGot(b); }
      });
    }).listen(0, '127.0.0.1', () => res({ port: (srv.address() as any).port, got, close: () => srv.close() }));
  });
}

describe('clamd INSTREAM', () => {
  it('envoie la commande, les blocs préfixés par leur longueur, puis le bloc nul', async () => {
    const f = await fake('stream: OK');
    const r = await scanBuffer(Buffer.from('bonjour'), { host: '127.0.0.1', port: f.port });
    const sent = await f.got; f.close();
    expect(r.status).toBe('CLEAN');
    expect(sent.subarray(0, 10).toString()).toBe('zINSTREAM\0');
    expect(sent.readUInt32BE(10)).toBe(7);
    expect(sent.subarray(14, 21).toString()).toBe('bonjour');
  });
  it('signale un fichier infecté avec sa signature', async () => {
    const f = await fake('stream: Win.Test.EICAR_HDB-1 FOUND');
    expect(await scanBuffer(Buffer.from('x'), { host: '127.0.0.1', port: f.port })).toEqual({ status: 'INFECTED', signature: 'Win.Test.EICAR_HDB-1' });
    f.close();
  });
  it('ne conclut jamais « sain » sur une réponse ERROR ou une connexion impossible', async () => {
    const f = await fake('INSTREAM size limit exceeded. ERROR');
    await expect(scanBuffer(Buffer.from('x'), { host: '127.0.0.1', port: f.port })).rejects.toThrow();
    f.close();
    await expect(scanBuffer(Buffer.from('x'), { host: '127.0.0.1', port: 1, timeoutMs: 500 })).rejects.toThrow();
  });
});
