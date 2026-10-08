import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { HttpException } from '@nestjs/common';

type ChallengeEntry = {
  challenge: string;
  userId?: string;
  exp: number;
  kind: 'register' | 'login' | 'recover' | 'add';
  codeId?: string;
  revokeOthers?: boolean;
};

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly isProd = process.env.NODE_ENV === 'production';

  // Fallbacks en mémoire UNIQUEMENT hors production
  private memoryChallenges = new Map<string, ChallengeEntry>();
  private memoryRateLimits = new Map<string, { n: number; reset: number }>();
  private memoryValues = new Map<string, { val: string; exp?: number }>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      try {
        this.client = new Redis(url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(times * 100, 3000),
          tls: url.startsWith('rediss://') ? { rejectUnauthorized: true } : undefined,
        });

        this.client.on('error', (err) => {
          this.logger.error(`Erreur connexion Redis: ${err.message}`);
        });

        this.client.on('connect', () => {
          this.logger.log('Connecté à Redis avec succès.');
        });
      } catch (err: any) {
        if (this.isProd) {
          throw new Error(`Échec critique de connexion à Redis en production: ${err.message}`);
        }
        this.logger.warn(`Redis non disponible, bascule sur mémoire locale (dev uniquement): ${err.message}`);
      }
    } else if (this.isProd) {
      throw new Error('REDIS_URL est obligatoire en production.');
    } else {
      this.logger.warn('REDIS_URL absent: utilisation du stockage en mémoire (développement uniquement).');
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  // ---- Challenges WebAuthn (TTL 5 min, usage unique garanti) ----

  async setChallenge(id: string, entry: Omit<ChallengeEntry, 'exp'>, ttlSeconds = 300): Promise<void> {
    const fullEntry: ChallengeEntry = {
      ...entry,
      exp: Date.now() + ttlSeconds * 1000,
    };

    if (this.client) {
      await this.client.set(
        `kibar:challenge:${id}`,
        JSON.stringify(fullEntry),
        'EX',
        ttlSeconds,
      );
    } else {
      this.memoryChallenges.set(id, fullEntry);
    }
  }

  async takeChallenge(id: string): Promise<ChallengeEntry | null> {
    if (this.client) {
      const key = `kibar:challenge:${id}`;
      // GETDEL est atomique (Redis 6.2+ / Upstash). Fallback Lua si indisponible.
      let raw: string | null = null;
      try {
        raw = await (this.client as any).getdel(key);
      } catch {
        const lua = `local v = redis.call('get', KEYS[1]); if v then redis.call('del', KEYS[1]) end; return v`;
        raw = await this.client.eval(lua, 1, key) as string | null;
      }

      if (!raw) return null;
      try {
        const parsed: ChallengeEntry = JSON.parse(raw);
        if (parsed.exp && parsed.exp < Date.now()) return null;
        return parsed;
      } catch {
        return null;
      }
    } else {
      const e = this.memoryChallenges.get(id);
      this.memoryChallenges.delete(id);
      return e && e.exp > Date.now() ? e : null;
    }
  }

  // ---- Rate Limiting (compteurs avec TTL) ----

  async checkRateLimit(key: string, max: number, windowMs: number): Promise<void> {
    if (this.client) {
      const redisKey = `kibar:rl:${key}`;
      const lua = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        return current
      `;
      const hits = (await this.client.eval(lua, 1, redisKey, windowMs)) as number;
      if (hits > max) {
        throw new HttpException('Trop de requêtes, veuillez réessayer ultérieurement.', 429);
      }
    } else {
      const now = Date.now();
      const h = this.memoryRateLimits.get(key);
      if (!h || h.reset < now) {
        this.memoryRateLimits.set(key, { n: 1, reset: now + windowMs });
        return;
      }
      if (++h.n > max) {
        throw new HttpException('Trop de requêtes, veuillez réessayer ultérieurement.', 429);
      }
    }
  }

  // ---- Méthodes génériques de stockage (avec TTL) ----

  async get(key: string): Promise<string | null> {
    if (this.client) {
      return this.client.get(key);
    }
    const entry = this.memoryValues.get(key);
    if (!entry) return null;
    if (entry.exp && entry.exp < Date.now()) {
      this.memoryValues.delete(key);
      return null;
    }
    return entry.val;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client) {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } else {
      this.memoryValues.set(key, { val: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
    }
  }

  async incr(key: string): Promise<number> {
    if (this.client) {
      return this.client.incr(key);
    }
    const cur = Number((await this.get(key)) || 0) + 1;
    await this.set(key, String(cur));
    return cur;
  }

  // ---- Health Check pour /ready ----

  async isHealthy(): Promise<boolean> {
    if (!this.client) {
      return !this.isProd; // en dev sans Redis, c'est toléré ; en prod, c'est non sain
    }
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
