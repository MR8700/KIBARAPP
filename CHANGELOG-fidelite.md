# Fidélisation maquettes — 08/10/2026
Écrans alignés : dashboard, form builder, candidatures, aperçu candidat.
- API : `GET /orgs` renvoie `userName` ; `GET /orgs/:id/recruitments` renvoie `selectedCount`.
- Web : composant `BottomNav`, classes `.ms` (Material Symbols), `.card-k`, `.field-k` ; police d'icônes ajoutée dans `layout.tsx`.
- Non reproduit (pas de donnée source) : score et photo des candidats, pièce jointe PDF de l'avis, image de bannière (dégradé à la place).

# Parcours simplifié « débutant » — 08/10/2026
- Splash animé (logo, slogan, chargement) ; accueil en 3 étapes illustrées, boutons clairs, sans jargon.
- Inscription : question simple, explication de l'empreinte/visage/code, codes de secours à confirmer avant d'entrer.
- Connexion et récupération : textes simples, erreurs en français clair (`lib/friendly.ts`).
- Nouveau recrutement (étape 1/4) : 4 modèles prêts (`lib/templates.ts`), raccourcis de date, aide sous chaque champ.
- Form builder (2/4) : modèle appliqué automatiquement, état vide guidé, astuce fermable, types de champ expliqués.
- Aperçu (3/4) puis écran de succès (4/4) : lien, partage WhatsApp, copie.
- Tableau de bord : création d'organisation guidée, état vide engageant.
- Global : cibles tactiles ≥ 44–48 px, focus visible, réduction des animations si demandé.

# Audit médias — 08/10/2026
- Corrigé : URLs signées via `S3_PUBLIC_ENDPOINT` (sinon injoignables depuis un téléphone), affichage 5 min / téléchargement 60 s.
- Corrigé : fichiers « FAILED » refusés à la candidature ; vrais types MIME pour Word/Excel/PowerPoint/vidéo ; en-têtes `nosniff` / `X-Frame-Options`.
- Candidat : vérification de taille et de type avant envoi, réduction automatique des grosses photos, barre de progression, miniature, « Réessayer ».
- Recruteur : icône par type, taille, état antivirus, boutons Ouvrir et Télécharger, bouton Télécharger dans le lecteur.
- Reste à faire (traité ci-dessous) : affiche/avis PDF, suppression des fichiers, sauvegarde, `SCAN_DISABLED`, documents Office.

# Finitions — 08/10/2026
- Affiche et avis PDF : `POST/DELETE /orgs/:org/recruitments/:id/assets/{poster|pdf}` (recruteur ; type vérifié par signature, 5 Mo / 15 Mo, analyse antivirus avant enregistrement, 503 si clamd injoignable). `posterUrl`/`pdfUrl` contiennent une clé de stockage ; l'API expose des URLs signées (1 h) via `GET recruitments/:id` et `GET /public/r/:token`. Builder : carte « Affiche et avis ». Candidat/aperçu : bandeau image et bloc « Avis de recrutement » (Lire / Télécharger). Remplacer ou retirer un fichier supprime l'ancien objet.
- Suppression d'une candidature : `DELETE .../applications/:appId` (ADMIN, RECRUTEUR) supprime la ligne, **puis** les objets du stockage (échecs journalisés), trace d'audit `application.delete`, événement temps réel `application.deleted`. Bouton avec confirmation dans le dossier.
- Sauvegarde : `scripts/backup.sh` (pg_dump + miroir du bucket + rotation 14 j + copie hors serveur optionnelle `BACKUP_REMOTE`) et service compose `storage-backup` (profil `backup`). Une sauvegarde sur la même machine ne protège pas de sa perte : prévoir une copie distante. Les fichiers supprimés disparaissent de la sauvegarde `latest` au passage suivant (`--remove`).
- Antivirus : en `NODE_ENV=production`, `SCAN_DISABLED=1` est ignoré et l'API refuse de démarrer s'il est présent.
- Documents Office : `files/office.ts` — OOXML : annuaire ZIP, `[Content_Types].xml`, partie principale cohérente avec l'extension, refus des macros VBA/ActiveX, chemins suspects et bombes de décompression ; .doc/.xls : flux `WordDocument`/`Workbook` requis, macros refusées.
- Tests : +14 (Office, assets, garde antivirus). Non rejoué ici : e2e (Prisma/MinIO/ClamAV absents du bac à sable) et `prisma generate`.

# Sécurité des appareils — 08/10/2026
- Biométrie/code de l'appareil **obligatoire** : `userVerification: 'required'` et `requireUserVerification: true` à l'inscription, à la connexion et à la confirmation.
- Récupération sûre : le code de secours n'est plus consommé au démarrage ; consommation, révocation des autres appareils et création du nouvel appareil se font dans UNE transaction, après preuve valide de la nouvelle passkey. Un échec (annulation, réseau) ne brûle plus le code et ne bloque personne.
- Confirmation biométrique (« step-up ») : `POST /auth/step-up/options|verify` → jeton de 2 min lié à l'utilisateur ET à la session, exigé (en-tête `X-Step-Up`) pour révoquer un appareil, régénérer les codes et ajouter un appareil. Un jeton de confirmation n'est pas accepté comme jeton d'accès.
- Ajout d'un appareil depuis un compte connecté : `POST /auth/devices/options|verify` (+ bouton « Ajouter un appareil », QR code proposé par le navigateur) sans consommer de code de secours.
- Tests : +5 unitaires (step-up) ; e2e mis à jour et étendus (récupération ratée, appareil sans biométrie refusé, ajout d'appareil, jeton step-up détourné). e2e non rejoués ici.
- Reste pour la production : challenges WebAuthn et rate limiting en mémoire (→ Redis), nettoyage des comptes PENDING jamais finalisés.
