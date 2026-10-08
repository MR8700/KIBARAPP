import { createConnection } from 'net';

export type ScanResult = { status: 'CLEAN' | 'INFECTED'; signature?: string };

/**
 * Client clamd, protocole INSTREAM : « zINSTREAM\0 » puis des blocs [longueur 4 octets BE][données],
 * terminés par une longueur nulle. Réponse : « stream: OK », « stream: <signature> FOUND » ou « ... ERROR ».
 * Rejette (donc ne conclut JAMAIS « sain ») sur erreur réseau, délai dépassé ou réponse inconnue.
 */
export function scanBuffer(buf: Buffer, opts: { host: string; port: number; timeoutMs?: number }): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const sock = createConnection({ host: opts.host, port: opts.port });
    let out = ''; let done = false;
    const end = (f: () => void) => { if (done) return; done = true; sock.destroy(); f(); };
    sock.setTimeout(opts.timeoutMs ?? 30_000, () => end(() => reject(new Error('clamd: délai dépassé'))));
    sock.on('error', (e) => end(() => reject(e)));
    sock.on('data', (d) => { out += d.toString('utf8'); });
    sock.on('close', () => end(() => {
      const r = out.replace(/\0/g, '').trim();
      if (/^stream: OK$/.test(r)) return resolve({ status: 'CLEAN' });
      const m = /^stream: (.+) FOUND$/.exec(r);
      if (m) return resolve({ status: 'INFECTED', signature: m[1] });
      reject(new Error('clamd: réponse inattendue : ' + r.slice(0, 120)));
    }));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 65_536) {
        const chunk = buf.subarray(i, i + 65_536); const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4)); // fin du flux
    });
  });
}

/** Antivirus désactivable UNIQUEMENT hors production : en production SCAN_DISABLED est ignoré (et refusé au démarrage). */
export const scanDisabled = () => process.env.SCAN_DISABLED === '1' && process.env.NODE_ENV !== 'production';
export function assertScanConfig() {
  if (process.env.SCAN_DISABLED === '1' && process.env.NODE_ENV === 'production')
    throw new Error('SCAN_DISABLED=1 est interdit en production : retirez-le (sinon tous les fichiers seraient considérés sains).');
}

export function pingClamd(opts: { host: string; port: number; timeoutMs?: number }): Promise<boolean> {
  if (scanDisabled()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const sock = createConnection({ host: opts.host, port: opts.port });
    let done = false;
    const end = (ok: boolean) => { if (done) return; done = true; sock.destroy(); resolve(ok); };
    sock.setTimeout(opts.timeoutMs ?? 2000, () => end(false));
    sock.on('error', () => end(false));
    sock.on('data', (d) => {
      if (d.toString().includes('PONG')) end(true);
    });
    sock.on('connect', () => {
      sock.write('zPING\0');
    });
  });
}

