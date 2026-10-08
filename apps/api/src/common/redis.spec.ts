import { describe, it, expect, beforeEach } from 'vitest';
import { RedisService } from './redis.service';
import { ChallengeStore } from '../auth/challenge.store';
import { rateLimit } from './rate-limit';

describe('RedisService & ChallengeStore (Memory fallback & logic)', () => {
  let redis: RedisService;
  let ch: ChallengeStore;

  beforeEach(() => {
    redis = new RedisService();
    ch = new ChallengeStore(redis);
  });

  it('génère un challenge et l\'extrait à usage unique (GETDEL)', async () => {
    await ch.put('test:123', {
      challenge: 'random-webauthn-challenge',
      kind: 'register',
      userId: 'user-abc',
    });

    const firstTake = await ch.take('test:123');
    expect(firstTake).not.toBeNull();
    expect(firstTake?.challenge).toBe('random-webauthn-challenge');
    expect(firstTake?.userId).toBe('user-abc');

    // Le deuxième take DOIT être nul (usage unique absolu / anti-rejeu)
    const secondTake = await ch.take('test:123');
    expect(secondTake).toBeNull();
  });

  it('rateLimit bloque après le seuil maximal de requêtes', async () => {
    const key = `test_ip_${Date.now()}`;
    // max 3 requêtes dans une fenêtre de 10 secondes
    await expect(rateLimit(key, 3, 10000)).resolves.not.toThrow();
    await expect(rateLimit(key, 3, 10000)).resolves.not.toThrow();
    await expect(rateLimit(key, 3, 10000)).resolves.not.toThrow();

    // La 4ème requête doit lever une exception HTTP 429
    await expect(rateLimit(key, 3, 10000)).rejects.toThrow(/Trop de requêtes/);
  });
});
