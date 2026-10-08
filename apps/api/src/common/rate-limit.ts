import { RedisService } from './redis.service';

let defaultRedis: RedisService | null = null;

function getRedisInstance(): RedisService {
  if (!defaultRedis) {
    defaultRedis = new RedisService();
  }
  return defaultRedis;
}

/**
 * Limiteur de débit distribué basé sur Redis (compteurs avec TTL) en production,
 * avec repli en mémoire hors production.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<void> {
  const redis = getRedisInstance();
  await redis.checkRateLimit(key, max, windowMs);
}
