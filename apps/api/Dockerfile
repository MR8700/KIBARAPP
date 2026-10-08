# Multi-stage Dockerfile pour KIBAR API (NestJS + Prisma + WebSocket)
# Étape 1 : Build & Dépendances
FROM node:26-alpine AS builder

WORKDIR /app

# Outils système nécessaires pour OpenSSL / Prisma
RUN apk add --no-cache openssl libc6-compat

# Copie des fichiers de configuration de paquet
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Installation des dépendances (y compris dev pour la compilation)
RUN npm ci

# Copie des schémas et du code source API
COPY apps/api/prisma ./apps/api/prisma/
COPY apps/api/src ./apps/api/src/
COPY apps/api/tsconfig.json ./apps/api/

# Génération du client Prisma et compilation TypeScript
WORKDIR /app/apps/api
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

# Étape 2 : Production Runner (Non-root)
FROM node:26-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

RUN apk add --no-cache openssl libc6-compat dumb-init

# Création d'un groupe et utilisateur non-root non privilégié
RUN addgroup -g 1001 -S kibar && \
    adduser -S -u 1001 -G kibar kibar

# Copie des manifestes racine et api
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Installation des dépendances de production
RUN npm ci --omit=dev --workspace=@kibar/api && \
    npm cache clean --force

# Copie du client Prisma généré, de Prisma CLI et des fichiers compilés
COPY --from=builder /app/node_modules/@prisma /app/node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/prisma /app/node_modules/prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh && chown -R kibar:kibar /app

USER kibar

EXPOSE 4000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/app/entrypoint.sh"]
