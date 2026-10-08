import { z } from 'zod';

const weakSecrets = new Set([
  'change-me-long-random',
  'dev-only-secret',
  'secret',
  'jwt_secret',
  'password',
  '12345678901234567890123456789012',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://neondb_owner:npg_5CnK7surWlXp@ep-shiny-frost-b88wiqiz-pooler.c-14.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require'),
  DIRECT_URL: z.string().optional().default('postgresql://neondb_owner:npg_5CnK7surWlXp@ep-shiny-frost-b88wiqiz.c-14.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require'),
  REDIS_URL: z.string().default('rediss://default:gQAAAAAAAz9HAAIgcDE4ZWQ4OTk5OWM2MjQ0NDZiYjcyNjE4MTRkNzUyZjJjYw@renewing-unicorn-212807.upstash.io:6379'),
  S3_ENDPOINT: z.string().default('https://r2.cloudflarestorage.com'),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().default('kibar-private-prod'),
  S3_ACCESS_KEY: z.string().default('kibar_storage_key_default'),
  S3_SECRET_KEY: z.string().default('kibar_storage_secret_default_min16'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit comporter au moins 32 caractères').default('kibar-prod-jwt-secret-ultra-secure-key-256bits-2026'),
  RP_ID: z.string().default('kibarapps.vercel.app'),
  RP_NAME: z.string().default('KIBAR'),
  WEB_ORIGIN: z.string().default('https://kibarapps.vercel.app'),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().default(3310),
  SCAN_DISABLED: z.string().optional(),
  SCAN_INTERVAL_MS: z.coerce.number().optional().default(5000),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

export function resetEnvCache(): void {
  cachedEnv = null;
}

export function validateEnv(forceReload = false): EnvConfig {
  if (cachedEnv && !forceReload) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    console.error(`\n❌ ERREUR FATALE: Configuration invalide au démarrage:\n${formatted}\n`);
    throw new Error(`Configuration environnement invalide:\n${formatted}`);
  }

  const cfg = result.data;

  // Règles strictes en mode production
  if (cfg.NODE_ENV === 'production') {
    const errors: string[] = [];

    if (cfg.SCAN_DISABLED === '1' || process.env.SCAN_DISABLED) {
      errors.push('SCAN_DISABLED est strictement interdit en production : retirez cette variable.');
    }

    if (weakSecrets.has(cfg.JWT_SECRET.toLowerCase()) || cfg.JWT_SECRET.includes('change-me')) {
      errors.push('JWT_SECRET contient une valeur d\'exemple ou trop faible pour la production (min 32 octets aléatoires requis).');
    }

    if (!cfg.WEB_ORIGIN.startsWith('https://')) {
      errors.push(`WEB_ORIGIN (${cfg.WEB_ORIGIN}) doit obligatoirement être en HTTPS en production.`);
    }

    if (!cfg.REDIS_URL) {
      errors.push('REDIS_URL est obligatoire en production pour les challenges WebAuthn, le rate limit et le relais temps réel multi-instances.');
    }

    if (cfg.DATABASE_URL.includes('kibar_dev')) {
      errors.push('DATABASE_URL utilise les identifiants de développement par défaut.');
    }

    if (cfg.S3_ACCESS_KEY === 'kibar' || cfg.S3_SECRET_KEY === 'kibar_dev_secret') {
      errors.push('S3_ACCESS_KEY ou S3_SECRET_KEY utilise les identifiants de test locaux par défaut.');
    }

    if (errors.length > 0) {
      const formatted = errors.map((e) => `  - ${e}`).join('\n');
      console.error(`\n❌ ERREUR FATALE DE SÉCURITÉ EN PRODUCTION:\n${formatted}\n`);
      throw new Error(`Sécurité production compromise:\n${formatted}`);
    }
  }

  cachedEnv = cfg;
  return cfg;
}
