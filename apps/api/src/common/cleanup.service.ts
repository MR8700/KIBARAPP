import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../files/storage.service';

const ONE_DAY_MS = 24 * 3600 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    // Démarrer après 30 secondes pour ne pas surcharger le boot initial
    this.timer = setTimeout(() => {
      void this.runCleanup();
      // Puis toutes les 6 heures
      this.timer = setInterval(() => void this.runCleanup(), 6 * 3600 * 1000);
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      clearTimeout(this.timer);
    }
  }

  async runCleanup(): Promise<{
    pendingUsers: number;
    sessions: number;
    orphanUploads: number;
  }> {
    if (this.isRunning) return { pendingUsers: 0, sessions: 0, orphanUploads: 0 };
    this.isRunning = true;
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - ONE_DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);

    let purgedUsersCount = 0;
    let purgedSessionsCount = 0;
    let purgedUploadsCount = 0;

    try {
      // 1. Purge des comptes PENDING non finalisés (> 24 h)
      const pendingUsers = await this.db.user.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: twentyFourHoursAgo },
        },
        select: { id: true },
        take: 200,
      });

      if (pendingUsers.length > 0) {
        const deleted = await this.db.user.deleteMany({
          where: { id: { in: pendingUsers.map((u) => u.id) } },
        });
        purgedUsersCount = deleted.count;
      }

      // 2. Purge des sessions / refresh tokens expirés ou révoqués depuis > 30 jours
      const expiredSessions = await this.db.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: thirtyDaysAgo } },
          ],
        },
      });
      purgedSessionsCount = expiredSessions.count;

      // 3. Purge des uploads temporaires orphelins (> 24 h)
      const orphanUploads = await this.db.pendingUpload.findMany({
        where: { createdAt: { lt: twentyFourHoursAgo } },
        take: 100,
        select: { id: true, storageKey: true },
      });

      for (const item of orphanUploads) {
        // Vérifier si le fichier n'a pas été rattaché à une application
        const isAttached = await this.db.applicationFile.count({
          where: { storageKey: item.storageKey },
        });

        if (isAttached === 0) {
          await this.storage.remove(item.storageKey).catch((err) => {
            this.logger.warn(`Impossible de supprimer l'objet S3 orphelin ${item.storageKey}: ${err.message}`);
          });
        }
      }

      if (orphanUploads.length > 0) {
        const deletedUploads = await this.db.pendingUpload.deleteMany({
          where: { id: { in: orphanUploads.map((o) => o.id) } },
        });
        purgedUploadsCount = deletedUploads.count;
      }

      this.logger.log(
        JSON.stringify({
          event: 'cleanup_job_completed',
          purgedPendingUsers: purgedUsersCount,
          purgedSessions: purgedSessionsCount,
          purgedOrphanUploads: purgedUploadsCount,
          timestamp: now.toISOString(),
        }),
      );
    } catch (err: any) {
      this.logger.error(`Erreur lors du nettoyage périodique: ${err.message}`);
    } finally {
      this.isRunning = false;
    }

    return {
      pendingUsers: purgedUsersCount,
      sessions: purgedSessionsCount,
      orphanUploads: purgedUploadsCount,
    };
  }
}
