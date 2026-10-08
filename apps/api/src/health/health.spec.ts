import { describe, it, expect, vi } from 'vitest';
import { HealthController } from './health.controller';

vi.mock('../files/clamav', () => ({
  pingClamd: vi.fn().mockResolvedValue(true),
  scanDisabled: vi.fn().mockReturnValue(false),
}));

describe('HealthController (/health and /ready)', () => {
  it('/health renvoie 200 avec uptime et status ok', () => {
    const ctrl = new HealthController({} as any, {} as any, {} as any);
    const mockRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    ctrl.health(mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
      }),
    );
  });

  it('/ready renvoie 200 si tous les composants sont sains', async () => {
    const mockDb = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const mockRedis = { isHealthy: vi.fn().mockResolvedValue(true) };
    const mockStorage = { isHealthy: vi.fn().mockResolvedValue(true) };

    const ctrl = new HealthController(mockDb as any, mockRedis as any, mockStorage as any);
    const mockRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await ctrl.ready(mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        checks: expect.objectContaining({
          db: 'ok',
          redis: 'ok',
          s3: 'ok',
          clamav: 'ok',
        }),
      }),
    );
  });
});
