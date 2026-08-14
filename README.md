# Splatt

Client desktop de **Splatt**, une appli de partage de médias "jumpscare" entre amis. Tu te connectes avec Discord, tu ajoutes des amis, et tu peux leur envoyer une image ou une vidéo qui s'affiche instantanément en overlay plein écran chez eux.

## Fonctionnalités

- Connexion via Discord OAuth (aucun mot de passe géré par l'app)
- Liste d'amis avec statut en ligne/hors ligne en temps réel
- Demandes d'ami (envoyer, accepter, refuser)
- Envoi d'un jumpscare (image ou vidéo) à un ou plusieurs amis, avec message et durée personnalisés
- Overlay de réception plein écran, transparent et 100% click-through — ne vole jamais le focus, même par-dessus un jeu
- Position à l'écran et volume réglables **côté destinataire**, dans ses propres paramètres
- Mute d'un ami : bloque réellement la réception de ses jumpscares, pas juste cosmétique
- Vraies photos de profil Discord (repli sur des initiales colorées si indisponible)
- Mise à jour automatique intégrée, avec un mode silencieux optionnel

## Stack technique

- **Frontend** : TypeScript vanilla (sans framework), [Vite](https://vite.dev), [Tailwind CSS v4](https://tailwindcss.com)
- **Application native** : [Tauri 2](https://tauri.app) (coquille Rust)
- **Backend** : [`livechat-api`](https://github.com/111418/livechat-api) — repo séparé, AdonisJS + Socket.IO

## Prérequis

- [Bun](https://bun.sh) — gestionnaire de paquets du projet
- [Rust](https://www.rust-lang.org/tools/install) (toolchain stable) — nécessaire pour compiler la partie Tauri
- Une instance de [`livechat-api`](https://github.com/111418/livechat-api) accessible — son URL se configure directement dans l'app, au premier lancement

## Développement

```bash
bun install
bun run tauri dev
```

Ça lance la fenêtre native Tauri par-dessus le serveur de dev Vite (rechargement à chaud inclus). `bun run dev` seul ne démarre que le frontend dans un navigateur, sans la fenêtre native ni les commandes Rust.

## Build

```bash
bun run tauri build
```

Produit un binaire optimisé et des installeurs (`.exe` NSIS + `.msi`) dans `src-tauri/target/release/bundle/`.

## Sortir une nouvelle version

1. Monte le numéro de version dans `package.json`, `src-tauri/tauri.conf.json` **et** `src-tauri/Cargo.toml` (les trois doivent rester synchronisés).
2. Commit, puis crée et pousse un tag :
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
3. Le workflow GitHub Actions (`.github/workflows/release.yml`) build, signe et publie automatiquement une Release GitHub avec les installeurs. Les copies de l'app déjà installées la détectent toutes seules au prochain lancement.

## Structure du projet

```
src/                        # Frontend — une page HTML par écran
├── login.html               # Connexion serveur + Discord
├── index.html                # Accueil (liste d'amis, groupes)
├── demandes.html              # Demandes d'ami
├── envoyer.html                # Envoi d'un jumpscare
├── parametres.html              # Paramètres (compte, overlay, serveur, sécurité)
├── overlay.html                  # Fenêtre overlay sans bordure
└── assets/js/
    ├── pages/                     # Logique propre à chaque écran
    ├── services/                   # Appels réseau (API REST + Socket.IO)
    └── utils/                       # Stores locaux (compte, mute, réglages...)

src-tauri/                  # Backend Rust
├── src/lib.rs                # Fenêtres natives, commandes Tauri, plugins
├── capabilities/               # Permissions par fenêtre
└── tauri.conf.json              # Config Tauri (deep link, updater, bundle...)
```
