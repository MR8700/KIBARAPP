# Guide de Mise en Production et d'Exploitation - KIBAR

Ce document constitue la référence opérationnelle pour le déploiement, l'exploitation, la sécurité, la sauvegarde et le plan de reprise d'activité (PRA) de l'infrastructure **KIBAR**.

---

## 1. Architecture Cible

```
                            [ Navigateur Client ]
                                /             \
            (HTML/JS, Next.js) /               \ (API REST / Uploads / wss://)
                              v                 v
                 +-----------------------+   +------------------------------------+
                 |      Vercel Edge      |   |            Fly.io Edge             |
                 |    app.kibar.app      |   |           api.kibar.app            |
                 +-----------------------+   +------------------------------------+
                                                                |
                                             +------------------+------------------+
                                             |                                     |
                                             v                                     v
                                    [ kibar-api (inst 1) ]               [ kibar-api (inst 2) ]
                                             |                                     |
                       +---------------------+---------------------+---------------+
                       |                     |                     |               |
                       v                     v                     v               v
                [ Neon PostgreSQL ]   [ Upstash Redis ]   [ Cloudflare R2 ]  [ kibar-clamd ]
                (Branche Prod + PITR)  (TLS, Pub/Sub,     (Bucket Privé,      (Fly Réseau
                 Pooler + Direct DDL   RateLimit, WebAuthn) URLs Signées)     Interne 6PN)
```

- **Frontend (Web)** : Next.js sur **Vercel** (app.DOMAINE). Le navigateur appelle l'API directement sans proxy intermédiaire pour éviter la limite de 4,5 Mo des fonctions serverless lors de l'upload de CV (jusqu'à 15-25 Mo).
- **Backend (API & WebSocket)** : NestJS sur **Fly.io** (api.DOMAINE), ≥ 2 instances haute disponibilité, Dockerfile multi-étapes non-root, endpoints `/health` et `/ready`.
- **Antivirus (ClamAV)** : Instance Fly privée (`kibar-clamd.internal:3310`), non exposée à Internet, volume persistant `clamdb` de 5 Go pour les signatures virales, freshclam actif.
- **Base de données** : **Neon PostgreSQL 16**, branche de production avec PITR (Point-in-Time Recovery) ≥ 7 jours. Deux chaînes de connexion distinctes :
  - `DATABASE_URL` : Connexion poolée pour les requêtes applicatives (DML).
  - `DIRECT_URL` : Connexion directe sans pooling pour les migrations DDL (`prisma migrate deploy`).
- **Cache & Mémoire partagée** : **Upstash Redis** (TLS). Stockage éphémère des challenges WebAuthn (`SET EX 300` / `GETDEL`), compteurs de rate limiting atomiques et bus de messages Pub/Sub pour le temps réel WebSocket entre instances API.
- **Stockage d'objets** : **Cloudflare R2** (ou AWS S3). Bucket strictement privé (aucun accès public). Accès exclusivement par URLs pré-signées à expiration courte (60s téléchargement, 300s consultation).

---

## 2. Variables d'Environnement

Toutes les variables sont validées au démarrage par Zod (`apps/api/src/common/env.ts`). En production, l'application refuse immédiatement de démarrer si un secret est faible, si `SCAN_DISABLED=1` est présent ou si `WEB_ORIGIN` n'est pas en HTTPS.

### API (`apps/api`)
| Variable | Description | Exemple en Production |
|---|---|---|
| `NODE_ENV` | Environnement d'exécution | `production` |
| `PORT` | Port d'écoute HTTP | `4000` |
| `DATABASE_URL` | Chaîne de connexion poolée Neon | `postgresql://user:pass@ep-xyz-pooler.eu-central-1.aws.neon.tech/kibar?sslmode=require` |
| `DIRECT_URL` | Chaîne de connexion directe Neon (DDL) | `postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/kibar?sslmode=require` |
| `REDIS_URL` | URL Redis Upstash avec TLS | `rediss://default:token@xyz.upstash.io:6379` |
| `JWT_SECRET` | Clé secrète JWT (min 32 octets aléatoires) | `openssl rand -hex 32` |
| `RP_ID` | Domaine apex de la passkey WebAuthn | `kibar.app` |
| `RP_NAME` | Nom de l'application affiché au prompt biométrique | `KIBAR` |
| `WEB_ORIGIN` | Origine frontend exacte (CORS & WebAuthn) | `https://app.kibar.app` |
| `S3_ENDPOINT` | Point de terminaison API S3 / Cloudflare R2 | `https://<account_id>.r2.cloudflarestorage.com` |
| `S3_PUBLIC_ENDPOINT` | Domaine public pour URLs signées | `https://<account_id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | Nom du bucket privé de production | `kibar-private-prod` |
| `S3_ACCESS_KEY` | Clé d'accès R2 dédiée | `...` |
| `S3_SECRET_KEY` | Clé secrète R2 dédiée | `...` |
| `CLAMAV_HOST` | Hôte interne Fly.io de clamd | `kibar-clamd.internal` |
| `CLAMAV_PORT` | Port de clamd | `3310` |

### Web (`apps/web`)
| Variable | Description | Valeur en Production |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Adresse de l'API appelée par le navigateur | `https://api.kibar.app` |

---

## 3. Procédure de Déploiement

### Déploiement automatisé (CI/CD GitHub Actions)
Chaque push sur `main` déclenche le workflow `.github/workflows/cd.yml` :
1. Exécution de `prisma migrate deploy` sur Neon via `DIRECT_URL`.
2. Déploiement rolling sur Fly.io avec vérification de santé sur `/ready`.
3. Déploiement du frontend sur Vercel Production.
4. Lancement automatique des smoke-tests post-déploiement.

### Déploiement manuel via scripts
```bash
# 1. Configurer les variables dans scripts/deploy/.deploy.env
cp scripts/deploy/.deploy.env.example scripts/deploy/.deploy.env
# Remplir le fichier avec les valeurs de production

# 2. Lancer le déploiement complet
./scripts/deploy/deploy.sh
```

---

## 4. Procédure de Rotation des Secrets

Pour renouveler les secrets JWT ou les clés de signature sans interruption :
```bash
./scripts/deploy/rotate-secrets.sh
```
Ce script génère un secret aléatoire de 256 bits via OpenSSL et l'injecte directement via `fly secrets import` sans jamais l'écrire sur disque ni dans l'historique git.

---

## 5. Sauvegardes et Restauration (PRA)

### Sauvegardes Quotidiennes Automatisées
- **Base de données** : Neon PITR continu (conservation 7 jours minimum) + dump quotidien chiffré AES-256 via `scripts/deploy/backup.sh`.
- **Fichiers** : Miroir quotidien du bucket R2 vers un bucket miroir secondaire avec rétention de 14 jours.

### Procédure de Restauration
Pour restaurer un dump de base de données dans une branche Neon de test ou de secours :
```bash
./scripts/deploy/restore.sh ./backups/db/kibar-YYYYMMDD_HHMMSS.dump.enc "$DATABASE_URL_CIBLE"
```
Pour restaurer le stockage :
```bash
mc mirror ./backups/storage/latest kibar-cible/kibar-private-prod
```

---

## 6. Procédure de Rollback

En cas d'incident critique en production :

1. **Frontend (Vercel)** :
   - Tableau de bord Vercel > Déploiements > Sélectionner le déploiement stable précédent > Cliquer sur **Promote to Production**.
2. **Backend (Fly.io)** :
   - Lister les versions : `fly releases list`
   - Revenir à la release précédente : `fly deploy --image <image-sha-precedente>`
3. **Base de données (Migrations)** :
   - Toutes les migrations Prisma suivent la règle **Expand / Contract** (rétro-compatibilité : pas de suppression immédiate de colonne en production).
   - En cas d'incohérence, utiliser la restauration Point-In-Time de Neon pour revenir à la minute précédant le déploiement.

---

## 7. Checklist Sécurité & Accès 2FA

| Fournisseur | Action Requise | État |
|---|---|---|
| **GitHub** | 2FA obligatoire, Secret Scanning actif, Push Protection active | [ ] À vérifier |
| **Vercel** | 2FA obligatoire, Deployment Protection sur les Previews activée | [ ] À vérifier |
| **Fly.io** | 2FA obligatoire, jetons CLI à portée restreinte | [ ] À vérifier |
| **Neon** | 2FA obligatoire, IP Allowlist activée, TLS obligatoire | [ ] À vérifier |
| **Upstash** | 2FA obligatoire, mot de passe complexe, TLS activé | [ ] À vérifier |
| **Cloudflare** | 2FA obligatoire, WAF actif, Bot Fight mode actif | [ ] À vérifier |

---

## 8. Surveillance et Contacts d'Alerte

- **Uptime Monitoring** : Sonde externe HTTP toutes les 60 secondes sur `https://api.kibar.app/ready`.
- **Alertes automatiques** :
  - Code retour différent de 200 sur `/ready`.
  - Taux d'erreurs 5xx > 1% sur 5 minutes.
  - Échec de la sauvegarde quotidienne.
  - Expiration des certificats TLS (< 15 jours).
- **Contact principal d'astreinte** : Variable `ALERT_EMAIL` configurée dans `.deploy.env`.
