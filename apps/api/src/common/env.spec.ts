import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv, resetEnvCache } from './env';

describe('validateEnv (Zod configuration validation)', () => {
  const origEnv = process.env;

  beforeEach(() => {
    resetEnvCache();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    resetEnvCache();
    process.env = origEnv;
  });

  it('valide un environnement de dev standard avec avertissements', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://kibar:kibar_dev@localhost:5432/kibar';
    process.env.JWT_SECRET = 'une-clef-de-developpement-de-trente-deux-caracteres-minimum';
    process.env.RP_ID = 'localhost';
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_BUCKET = 'kibar-private';
    process.env.S3_ACCESS_KEY = 'kibar';
    process.env.S3_SECRET_KEY = 'kibar_dev_secret';

    const cfg = validateEnv();
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.RP_ID).toBe('localhost');
  });

  it('refuse SCAN_DISABLED=1 en production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-cool-db.eu-central-1.aws.neon.tech/kibar?sslmode=require';
    process.env.REDIS_URL = 'rediss://default:token@cool-redis.upstash.io:6379';
    process.env.JWT_SECRET = 'un-secret-production-tres-long-et-securise-de-plus-de-32-octets';
    process.env.RP_ID = 'kibar.app';
    process.env.WEB_ORIGIN = 'https://app.kibar.app';
    process.env.S3_ENDPOINT = 'https://r2.cloudflarestorage.com';
    process.env.S3_BUCKET = 'kibar-private';
    process.env.S3_ACCESS_KEY = 'valid-key';
    process.env.S3_SECRET_KEY = 'valid-secret';
    process.env.SCAN_DISABLED = '1';

    expect(() => validateEnv()).toThrow(/SCAN_DISABLED est strictement interdit en production/);
  });

  it('refuse WEB_ORIGIN non https en production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SCAN_DISABLED;
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-cool-db.eu-central-1.aws.neon.tech/kibar?sslmode=require';
    process.env.REDIS_URL = 'rediss://default:token@cool-redis.upstash.io:6379';
    process.env.JWT_SECRET = 'un-secret-production-tres-long-et-securise-de-plus-de-32-octets';
    process.env.RP_ID = 'kibar.app';
    process.env.WEB_ORIGIN = 'http://app.kibar.app'; // Non-https !
    process.env.S3_ENDPOINT = 'https://r2.cloudflarestorage.com';
    process.env.S3_BUCKET = 'kibar-private';
    process.env.S3_ACCESS_KEY = 'valid-key';
    process.env.S3_SECRET_KEY = 'valid-secret';

    expect(() => validateEnv()).toThrow(/doit obligatoirement être en HTTPS/);
  });

  it('refuse JWT_SECRET faible ou secret d\'exemple en production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SCAN_DISABLED;
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-cool-db.eu-central-1.aws.neon.tech/kibar?sslmode=require';
    process.env.REDIS_URL = 'rediss://default:token@cool-redis.upstash.io:6379';
    process.env.JWT_SECRET = 'change-me-long-random-please-change-it-now'; // contient change-me
    process.env.RP_ID = 'kibar.app';
    process.env.WEB_ORIGIN = 'https://app.kibar.app';
    process.env.S3_ENDPOINT = 'https://r2.cloudflarestorage.com';
    process.env.S3_BUCKET = 'kibar-private';
    process.env.S3_ACCESS_KEY = 'valid-key';
    process.env.S3_SECRET_KEY = 'valid-secret';

    expect(() => validateEnv()).toThrow(/valeur d'exemple ou trop faible/);
  });
});
