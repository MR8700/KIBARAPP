# Avancement KIBAR (prompt directeur, 18 phases)
| Phase | État |
|---|---|
| 1 Monorepo + infra (Docker: Postgres/Redis/MinIO) | Fait |
| 2 Auth device-bound (WebAuthn, sessions, appareils, recovery) | Fait : API validée par 10 tests e2e sur PostgreSQL (vraies signatures via authentificateur virtuel). UI : `/enroll` (codes copiables/téléchargeables), `/login`, **`/recover`** (code de secours, option « déconnecter mes autres appareils »), **`/app/security`** (appareils, révocation, régénération des codes, déconnexion). Parcours navigateur réel non encore joué |
| 3 Organisations + rôles (RBAC backend) | Fait (guards) |
| 4 Recrutements (CRUD, token public opaque) | Fait : API + UI (onboarding organisation, dashboard, création, copie du lien) |
| 5-6 Form builder + autosave (verrou optimiste) | Fait : API + UI dnd-kit (appui long mobile, vibration, indicateur Enregistré) |
| 7-8 Aperçu obligatoire + publication | Fait : API + UI (Modifier / Valider le lancement) |
| 9 Tunnel candidat | Fait : /r/[token] (Présentation, Formulaire, Vérification, Confirmation) |
| 10 Documents privés | Fait : MinIO, validation par signature réelle, URLs signées 60 s, viewer. Antivirus : voir « 10 (suite) » |
| 11 Candidatures + dossiers (liste, filtre par statut, dossier, historique, actions multiples, documents) | Fait |
| 13 Moteur de filtres (ET/OU/NON, groupes imbriqués, opérateurs par type, compteur en direct) | Fait : évaluateur testé + UI. Filtrage par lots (curseur) avec le même évaluateur : plafond porté à 100 000 candidatures analysées, export ≤ 50 000 lignes, vue sans filtre paginée en SQL. Au-delà : traduction SQL/Meilisearch |
| 14 Retenus + exports | Fait : espace /selected (colonnes ordonnables et enregistrées par recrutement), exports Excel / PDF / CSV côté serveur, impression navigateur (A4 paysage). Espace Retenus chargé à 5 000 lignes max ; PDF limité à 2000 lignes |
| 12 Temps réel | Fait : WebSocket /ws (auth par 1er message, rooms par organisation, sessions revalidées). Événements : application.new, application.status. Plusieurs instances : relais Redis pub/sub via REDIS_URL (repli local si Redis tombe) |
| 15 Notifications | Fait : table Notification, une entrée par ADMIN/RECRUTEUR à chaque candidature, cloche + « tout marquer lu » (dashboard), rafraîchie en direct. Pas de purge automatique |
| 16 Statistiques | Fait : /recruitments/[id]/stats (statuts, taux de retenus, 30 derniers jours, répartition des champs à choix), mise à jour en direct |
| 17 Audit | Fait : GET /orgs/:id/audit (ADMIN, pagination par curseur) + page /app/audit avec filtres |
| 18 Tests e2e | Fait : 16 tests (`flow.e2e.ts` 6 + `auth.e2e.ts` 10), tous verts sur PostgreSQL 16 + Redis + WebSocket (S3 simulé, Prisma 7/adaptateur pg dans l'environnement de test). À rejouer avec Prisma 5.22 / MinIO / ClamAV. Unitaires (30) : filtres, crypto, sniff, table Retenus, stats, scan, relais, clamd |
| 10 (suite) Antivirus | Fait : clamd (service docker `clamav`), client INSTREAM testé contre un faux serveur, worker d'analyse (PENDING → CLEAN/INFECTED/FAILED, fichier infecté supprimé, clamd injoignable = reste bloqué et réessayé), purge des uploads orphelins > 24 h. En prod : retirer SCAN_DISABLED |
| Identité visuelle | Fait : logo (symbole + mot-symbole) sur accueil, connexion, enrôlement, récupération et dashboard ; favicon, icône Apple, manifest PWA (icônes 192/512/maskable), couleur de thème ; splash (1,2 s, une fois par session) et accueil alignés sur les maquettes. Non fait : mode hors ligne / service worker |
| Production | **À faire** : retirer SCAN_DISABLED, JWT_SECRET sans repli, challenges WebAuthn et rate limiting partagés (Redis), migrations Prisma versionnées, Dockerfiles, CI |
| Hors phases | Traduction SQL (jsonb) ou Meilisearch du moteur de filtres, à valider contre une vraie base |
