# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Client desktop ("Splatt" / `livechat`) de l'application LiveChat de partage de médias entre amis, construit avec Tauri 2 (backend Rust + frontend vanilla TS/HTML/Tailwind, sans framework JS, sans bundler autre que Vite). Les utilisateurs s'authentifient via Discord OAuth auprès d'un backend séparé (`livechat-api`), gèrent leurs amis, et s'envoient des médias qui s'affichent en overlay sans bordure sur l'écran du destinataire.

## Commandes

Le gestionnaire de paquets est **bun** (`beforeDevCommand`/`beforeBuildCommand` dans `src-tauri/tauri.conf.json` appellent `bun run ...`) ; bien que `package-lock.json`/`pnpm-lock.yaml` soient aussi présents, préférer `bun`.

```bash
bun run dev        # Serveur de dev Vite seul (frontend sur localhost:1420)
bun run build       # typecheck tsc + build vite -> dist/
bun run tauri dev   # app complète : lance la coquille Rust/Tauri autour du serveur de dev Vite
bun run tauri build # produit les bundles desktop installables
```

Il n'y a actuellement ni suite de tests ni linter configuré dans ce repo.

## Architecture

**Deux runtimes** : un backend Rust/Tauri (`src-tauri/`) qui possède les fenêtres natives et la config persistante locale, et un frontend Vite en TS vanilla (`src/`) rendu dans des webviews Tauri. La communication passe par `invoke()` (frontend → commandes Rust, voir `src-tauri/src/lib.rs`) et par les events Tauri (Rust → frontend).

**Fenêtres / pages HTML d'entrée** — le build Vite a plusieurs entrées rollup (`vite.config.ts`), chacune une page HTML autonome chargée dans une webview Tauri :
- `src/login.html` — écran de saisie de l'URL du serveur / connexion, affiché quand aucun token n'est stocké.
- `src/index.html` — écran principal "accueil" (liste d'amis, groupes, demandes) une fois authentifié.
- `src/overlay.html` — fenêtre overlay sans bordure, toujours au premier plan, qui s'affiche pour montrer un média reçu.

`src-tauri/src/lib.rs` décide au démarrage quelle page charger (`index.html` vs `login.html`) en vérifiant dans `config.json` (via `tauri-plugin-store`) la présence d'un token stocké (cette vérification est actuellement neutralisée et toujours vraie — voir le `|| true` dans `run()`).

**Structure du frontend** (`src/assets/`) :
- `js/components/` — Web Components vanilla enregistrés via `customElements.define` (ex. `<livechat-titlebar>` dans `titlebar.ts`, utilisé sur chaque page, pilote le minimize/maximize/close natif de la fenêtre via `@tauri-apps/api/window`).
- `js/utils/` — petits helpers (ex. `avatar.ts` pour les initiales).
- `css/pages/*.css` + `css/components/*.css` — styles par page et par composant, composés avec Tailwind (`css/tailwind.css`, Tailwind v4 via `@tailwindcss/vite`).
- Le combo `<script>` de chaque page est : composant titlebar + CSS spécifique à la page + `main.ts` (actuellement un point d'entrée partagé, pas encore séparé par page).

**Côté Rust** (`src-tauri/src/`) : `main.rs` est un point d'entrée minimal qui appelle `lib.rs`, qui contient la véritable config du `Builder` Tauri — plugins (`tauri-plugin-store`, `tauri-plugin-opener`), la commande `greet` (reliquat du template), et la construction des fenêtres. Les nouvelles commandes Tauri vont dans `lib.rs` et doivent être enregistrées dans `invoke_handler![...]`. Les capabilities/permissions des fenêtres sont déclarées dans `src-tauri/capabilities/default.json`.

## Contrat de l'API backend

Cette app communique avec un backend AdonisJS séparé, `livechat-api`, absent de ce repo. Points clés à connaître pour les prochains développements :

- **Deux serveurs** : API REST sur `http://localhost:3333` (dev), serveur WebSocket Socket.IO indépendant codé en dur sur `http://localhost:3330` (dev).
- **Auth** : uniquement Discord OAuth (pas d'email/mot de passe). Flow : naviguer vers `GET /auth/discord-login` → Discord redirige avec `?code=` → appeler `GET /auth/login?code=...` → récupérer un JWT sans expiration → l'envoyer en `Authorization: Bearer <jwt>` sur tous les appels REST, et en string brute via un event WebSocket `authenticate` (fire-and-forget ; un `disconnect` précoce après connexion signale un échec d'auth, il n'y a pas d'event d'erreur explicite).
- **L'envoi de médias passe toujours par HTTP, jamais par un emit socket** : `POST /send-to/:users` (Discord IDs séparés par des virgules), `multipart/form-data` avec un champ `file` (plafond serveur de 10 Mo) plus optionnellement `message`, `transparent`, `duration`. Tous les destinataires doivent déjà être amis sinon l'appel échoue entièrement. La réponse est un 200 au corps vide.
- **La réception passe uniquement par WebSocket** : après `authenticate`, le socket rejoint la room `user:<discordId>` et reçoit les events `friend_online`, `friend_offline`, `friend_request`, `friend_request_edit`, `friend_removed`, et `livechat` (`{ url, message, transparent, author_discord_id, author_name, duration }` — c'est cet event qui doit piloter la fenêtre overlay).
- **REST amis** : `POST /friends/send-to/:friendId` (envoyer une demande), `POST /friends/accept/:friendId`, `PATCH /friends/reject/:friendId`, `DELETE /friends/unfriend/:friendId`, `GET /friends`, `GET /friends/requests` → `{ sent, received }`. `received` n'est pas pré-filtré des demandes rejetées — filtrer sur `isRejected` côté client.
- Les URLs de médias renvoyées par `POST /send-to` sont soit une URL CDN Discord (à durée de vie longue), soit une URL locale `/uploads/livechat/...` que le backend nettoie après quelques minutes — récupérer/afficher ces médias immédiatement à réception de l'event `livechat` plutôt que de compter dessus plus tard.
- Tous les corps d'erreur sont `{ "message": "..." }` (ou `{ "errors": [...] }` pour les échecs de validation 422) ; 401 si le JWT est absent ou invalide.

## Conventions de développement

- C'est Ihlane qui développe ; Claude assiste, suggère et explique, mais ne prend pas d'initiative non demandée — ne pas réécrire du code non concerné par la tâche en cours.
- Toujours expliquer les choix techniques quand on touche au Rust (Ihlane apprend Rust).
- Si un choix architectural est ambigu, proposer plusieurs options plutôt que de trancher seul.
- Garder le frontend volontairement simple : pas de framework JS, pas de bundler en dehors de Vite.
