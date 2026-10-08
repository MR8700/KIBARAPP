# KIBAR APP
Principe : **l'appareil est la clé** (passkeys WebAuthn). Aucun mot de passe.

## Démarrage rapide (développement)
```
cp .env.example apps/api/.env
npm install
npm run db                      # Postgres, Redis, MinIO, ClamAV (docker compose)
cd apps/api && npx prisma migrate dev --name init && cd ../..
npm run api                     # http://localhost:4000  (compile avec tsc puis relance à chaque changement)
npm run web                     # http://localhost:3000
```
Notes :
- `npx prisma migrate dev` génère aussi le client Prisma. Aucune migration n'est versionnée dans le dépôt : la première commande crée `apps/api/prisma/migrations/` (à committer).
- L'API ne se lance pas avec `tsx` : NestJS a besoin des métadonnées de décorateurs (`emitDecoratorMetadata`), que `tsx` n'émet pas. D'où `tsc-watch`.
- ClamAV met 1 à 2 minutes à charger ses signatures au premier démarrage. Tant que `SCAN_DISABLED=1` est dans `.env`, les fichiers sont déclarés sains sans analyse (développement uniquement).
- Le front lit l'URL de l'API dans `NEXT_PUBLIC_API_URL` (défaut `http://localhost:4000`).
- WebAuthn : `RP_ID` et `WEB_ORIGIN` du `.env` doivent correspondre au domaine réel du front (`localhost` en local, HTTPS obligatoire sinon).

## Tests
- Unitaires (30 tests, aucune infra requise) : `npm -w apps/api test`.
- E2E (16 tests) : démarrer l'API sur une base de **dev/test** (`npm run db`, migrate, `npm run api`), puis `npm -w apps/api run test:e2e`. Les données sont créées avec un suffixe aléatoire et supprimées en fin de test.
  - `flow.e2e.ts` (6) : candidature → notification temps réel → retenu → exports → droits/isolation.
  - `auth.e2e.ts` (10) : vraies cérémonies WebAuthn rejouées par un authentificateur logiciel (`virtual-authenticator.ts`, ES256) : inscription, preuve falsifiée, connexion, anti-replay, rotation du refresh, récupération par code, révocation d'appareil, régénération des codes, déconnexion, audit.
  - Les limites de débit (en mémoire) peuvent renvoyer 429 si vous relancez les tests plusieurs fois de suite : redémarrez l'API entre deux exécutions.
- État de validation : ces 16 tests passent sur un vrai PostgreSQL 16 + Redis + WebSocket (stockage S3 simulé, antivirus désactivé), mais **dans un environnement de test sans accès aux moteurs Prisma 5.22** (client Prisma 7 avec adaptateur `pg`, tables créées depuis le schéma). Premier lancement à faire chez vous avec la stack réelle (`prisma migrate dev`, MinIO, ClamAV) : voir « Reste à faire ».

## Limites connues
| Sujet | Limite |
|---|---|
| Filtres / liste filtrée | 100 000 candidatures analysées (par lots de 1000) |
| Export des candidatures | 50 000 lignes (sinon : affiner le filtre) |
| Espace Retenus | 5 000 lignes chargées ; PDF limité à 2 000 lignes (Excel/CSV au-delà) |
| Notifications | pas de purge automatique |
| Sessions WebAuthn (challenges) | stockées en mémoire d'une instance (`challenge.store.ts`) : non partagées entre plusieurs instances API |

## Reste à faire
Suivi détaillé par phase : `docs/ROADMAP.md`. Les maquettes sources sont dans `design/`.

1. **Rejouer chez vous** avec la stack exacte : `prisma migrate dev` (Prisma 5.22), MinIO, ClamAV (`SCAN_DISABLED` retiré, fichier de test EICAR), puis `npm -w apps/api run test:e2e`.
2. **Test navigateur des passkeys** : les écrans `/enroll`, `/login`, `/recover` et `/app/security` compilent (`next build`) et se rendent, mais le parcours WebAuthn dans l'interface n'a pas été joué dans un vrai navigateur (seule l'API l'a été). À faire : Chrome DevTools > WebAuthn (authentificateur virtuel) ou Playwright.
3. **Production** (`NODE_ENV=production`) : `SCAN_DISABLED` est désormais refusé au démarrage (retirez-le) ; planifiez `scripts/backup.sh` (ou `docker compose --profile backup up -d`) avec une copie hors serveur ; définir un `JWT_SECRET` fort (le repli `dev-only-secret` est codé en dur), HTTPS, `RP_ID`/`WEB_ORIGIN` réels, challenges WebAuthn dans Redis pour le multi-instances, rate limiting partagé (actuellement en mémoire), migrations Prisma versionnées, Dockerfiles et CI.
4. **Auth, durcissement** : la réutilisation d'un refresh token déjà consommé est refusée mais ne révoque pas la chaîne de sessions (pas de détection de vol de refresh).
5. **Passage à l'échelle des filtres** : traduction SQL (jsonb) ou Meilisearch, à valider contre une vraie base.
6. **Purge** des notifications anciennes.
