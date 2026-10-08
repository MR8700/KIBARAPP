import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '../common/redis.service';

export type ChallengeEntry = {
  challenge: string;
  userId?: string;
  exp?: number;
  kind: 'register' | 'login' | 'recover' | 'add';
  codeId?: string;
  revokeOthers?: boolean;
};

/**
 * Stockage éphémère des challenges WebAuthn (usage unique garanti, TTL 5 min).
 * Délégué à Redis (SET EX 300 + GETDEL) en production, avec repli mémoire hors production.
 */
@Injectable()
export class ChallengeStore {
  private redisClient: RedisService;

  constructor(@Optional() redis?: RedisService) {
    this.redisClient = redis ?? new RedisService();
  }

  async put(id: string, e: Omit<ChallengeEntry, 'exp'>): Promise<void> {
    await this.redisClient.setChallenge(id, e, 300);
  }

  async take(id: string): Promise<ChallengeEntry | null> {
    return this.redisClient.takeChallenge(id);
  }
}
