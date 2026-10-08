import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma/prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ChallengeStore } from './auth/challenge.store';
import { AuthGuard } from './common/auth.guard';
import { OrgGuard } from './common/org.guard';
import { OrgsController } from './orgs/orgs.controller';
import { RecruitmentsController } from './recruitments/recruitments.controller';
import { RecruitmentsService } from './recruitments/recruitments.service';
import { ApplicationsController } from './applications/applications.controller';
import { StorageService } from './files/storage.service';
import { PublicController } from './public/public.controller';
import { SelectedController } from './selected/selected.controller';
import { StatsController } from './stats/stats.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { AuditController } from './audit/audit.controller';
import { ScanWorker } from './files/scan.worker';
import { RealtimeService } from './realtime/realtime.service';
import { HealthController } from './health/health.controller';
import { RedisService } from './common/redis.service';
import { CleanupService } from './common/cleanup.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-only-secret-for-local-development-only-32bytes',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    OrgsController,
    RecruitmentsController,
    ApplicationsController,
    SelectedController,
    StatsController,
    NotificationsController,
    AuditController,
    PublicController,
  ],
  providers: [
    PrismaService,
    RedisService,
    CleanupService,
    AuthService,
    ChallengeStore,
    AuthGuard,
    OrgGuard,
    RecruitmentsService,
    StorageService,
    RealtimeService,
    NotificationsService,
    ScanWorker,
  ],
})
export class AppModule {}
