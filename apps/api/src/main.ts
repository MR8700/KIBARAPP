import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ZodFilter } from './common/zod.filter';
import { validateEnv } from './common/env';
import { jsonLoggerMiddleware } from './common/logger';
import { RealtimeService } from './realtime/realtime.service';

async function bootstrap() {
  // 1. Validation immédiate et stricte des variables d'environnement
  const cfg = validateEnv();

  const app = await NestFactory.create(AppModule, {
    logger: cfg.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const httpAdapter = app.getHttpAdapter().getInstance();

  // 2. Trust proxy pour identifier l'IP client réelle derrière Fly.io / Cloudflare
  httpAdapter.set('trust proxy', 1);

  // 3. Headers de sécurité Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // API pure JSON, CSP stricte gérée sur apps/web
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Headers de sécurité complémentaires
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // 4. Timeout des requêtes HTTP (30 secondes max par requête)
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(30000, () => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway Timeout: requête trop longue' });
      }
    });
    next();
  });

  // 5. Journalisation JSON sans données personnelles ni tokens
  app.use(jsonLoggerMiddleware);

  // 6. Limite de taille de corps JSON / Form
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // 7. CORS : WEB_ORIGIN, Vercel et dev local
  const allowedOrigins = [
    cfg.WEB_ORIGIN,
    cfg.WEB_ORIGIN.replace(/\/$/, ''),
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error(`Origine CORS non autorisée: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Step-Up', 'Accept', 'X-Request-Id'],
    maxAge: 86400,
  });

  // 8. Filtre global Zod pour erreurs 400 propres
  app.useGlobalFilters(new ZodFilter());

  // 9. Attachement WebSocket /ws
  app.get(RealtimeService).attach(app.getHttpServer());

  // 10. Arrêt gracieux (graceful shutdown)
  app.enableShutdownHooks();

  const port = cfg.PORT;
  const server = await app.listen(port, '0.0.0.0');

  console.log(`[KIBAR API] Démarrée sur le port ${port} (0.0.0.0) en mode ${cfg.NODE_ENV}`);

  // Gestion des signaux de terminaison
  const handleSignal = (signal: string) => {
    console.log(`[KIBAR API] Signal ${signal} reçu, arrêt gracieux en cours...`);
    server.close(() => {
      console.log('[KIBAR API] Serveur HTTP fermé proprement.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[KIBAR API] Forçage de l\'arrêt après timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[KIBAR API] Échec critique au démarrage:', err);
  process.exit(1);
});
