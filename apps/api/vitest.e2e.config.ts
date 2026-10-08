import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Tests de bout en bout « boîte noire » : ils pilotent une API déjà démarrée (E2E_API_URL, défaut http://localhost:4000)
// et amorcent leurs données via Prisma (DATABASE_URL de apps/api/.env). À n'exécuter que contre une base de DEV/TEST.
export default defineConfig(({ mode }) => ({
  test: { include: ['test/e2e/**/*.e2e.ts'], env: loadEnv(mode, process.cwd(), ''), testTimeout: 30_000, hookTimeout: 30_000, fileParallelism: false },
}));
