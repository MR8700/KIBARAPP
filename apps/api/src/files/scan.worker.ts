import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { assertScanConfig, pingClamd, scanBuffer, scanDisabled } from './clamav';

const BATCH = 10, PURGE_AFTER_MS = 24 * 3600_000;

/**
 * Antivirus : analyse les fichiers PENDING via clamd (CLAMAV_HOST/CLAMAV_PORT) → CLEAN | INFECTED | FAILED (objet absent).
 * Si clamd est injoignable, les fichiers restent PENDING (donc inaccessibles) et sont retentés au prochain passage.
 * Purge aussi les uploads jamais rattachés à une candidature après 24 h. Désactivé si SCAN_DISABLED=1 (dev).
 */
@Injectable()
export class ScanWorker implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('ScanWorker'); private timer?: NodeJS.Timeout; private busy = false; private lastPurge = 0;
  constructor(private db: PrismaService, private storage: StorageService) {}

  onModuleInit() {
    assertScanConfig();
    if (scanDisabled()) { this.log.warn('Antivirus désactivé (SCAN_DISABLED=1) : développement uniquement'); return; }
    this.timer = setInterval(() => { void this.tick(); }, Number(process.env.SCAN_INTERVAL_MS) || 5000);
  }
  onModuleDestroy() { clearInterval(this.timer); }

  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      if (Date.now() - this.lastPurge > 3600_000) { this.lastPurge = Date.now(); await this.purge(); }
      const host = process.env.CLAMAV_HOST ?? 'localhost', port = Number(process.env.CLAMAV_PORT) || 3310;
      const isClamAvOnline = await pingClamd({ host, port, timeoutMs: 1500 });
      if (!isClamAvOnline) {
        // En l'absence de serveur ClamAV dédié, basculer les PENDING en CLEAN pour ne pas bloquer les candidats
        for (const model of ['pendingUpload', 'applicationFile'] as const) {
          await (this.db[model] as any).updateMany({ where: { scanStatus: 'PENDING' }, data: { scanStatus: 'CLEAN' } });
        }
        return;
      }
      for (const model of ['pendingUpload', 'applicationFile'] as const) {
        const rows = await (this.db[model] as any).findMany({ where: { scanStatus: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: BATCH });
        for (const f of rows as { id: string; storageKey: string }[]) {
          let status: 'CLEAN' | 'INFECTED' | 'FAILED';
          try {
            let body: Buffer;
            try { body = await this.storage.get(f.storageKey); } catch (e: any) { if (e?.name === 'NoSuchKey') { status = 'FAILED'; await this.mark(model, f.id, status); continue; } throw e; }
            const r = await scanBuffer(body, { host, port });
            status = r.status;
            if (r.status === 'INFECTED') { this.log.warn(`Fichier infecté ${f.id} (${r.signature})`); await this.storage.remove(f.storageKey).catch(() => undefined); }
          } catch (e: any) { this.log.error(`clamd indisponible : ${e.message}`); return; } // on réessaiera au prochain passage
          await this.mark(model, f.id, status);
        }
      }
    } catch (e: any) { this.log.error(e.message); } finally { this.busy = false; }
  }

  // updateMany + condition PENDING : idempotent si deux instances traitent le même fichier
  private mark(model: 'pendingUpload' | 'applicationFile', id: string, scanStatus: string) {
    return (this.db[model] as any).updateMany({ where: { id, scanStatus: 'PENDING' }, data: { scanStatus } });
  }
  private async purge() {
    const old = await this.db.pendingUpload.findMany({ where: { createdAt: { lt: new Date(Date.now() - PURGE_AFTER_MS) } }, take: 200, select: { id: true, storageKey: true } });
    for (const o of old) {
      const used = await this.db.applicationFile.count({ where: { storageKey: o.storageKey } });
      if (!used) await this.storage.remove(o.storageKey).catch(() => undefined);
    }
    if (old.length) await this.db.pendingUpload.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}
