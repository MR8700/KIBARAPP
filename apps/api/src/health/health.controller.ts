import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { StorageService } from '../files/storage.service';
import { pingClamd } from '../files/clamav';

@Controller()
export class HealthController {
  constructor(
    private readonly db: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  root(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      name: 'KIBAR API',
      status: 'running',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('health')
  health(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }


  @Get('ready')
  async ready(@Res() res: Response) {
    const checks: Record<string, 'ok' | 'error'> = {
      db: 'error',
      redis: 'error',
      s3: 'error',
      clamav: 'error',
    };

    // 1. Check DB
    try {
      await Promise.race([
        this.db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 2000)),
      ]);
      checks.db = 'ok';
    } catch {
      checks.db = 'error';
    }

    // 2. Check Redis
    try {
      const ok = await this.redis.isHealthy();
      checks.redis = ok ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    // 3. Check S3 / R2
    try {
      const ok = await this.storage.isHealthy();
      checks.s3 = ok ? 'ok' : 'error';
    } catch {
      checks.s3 = 'error';
    }

    // 4. Check ClamAV
    try {
      const host = process.env.CLAMAV_HOST ?? 'localhost';
      const port = Number(process.env.CLAMAV_PORT) || 3310;
      const ok = await pingClamd({ host, port, timeoutMs: 2000 });
      checks.clamav = ok ? 'ok' : 'error';
    } catch {
      checks.clamav = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    if (allOk) {
      return res.status(HttpStatus.OK).json({
        status: 'ok',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      status: 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}
