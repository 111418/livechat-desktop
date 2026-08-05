# JumpScare App — Contexte projet

## Vue d'ensemble
Application desktop légère permettant d'envoyer un média (GIF, image, vidéo) à un ami, qui s'affiche directement sur son écran sous forme d'overlay sans bordure.
Inspiré du livechat CacaBox (https://github.com/Nevylish/LiveChat).

## Stack technique
- **Framework** : Tauri (Rust backend + WebView frontend)
- **Frontend** : HTML / CSS / Vanilla JS + Tailwind CSS
- **Client WebSocket** : `tokio-tungstenite` (Rust)
- **Config persistante** : `tauri-plugin-store` (JSON local)
- **Auth** : OAuth2 Discord

## Architecture
```
Discord (commande)
    ↓
Bot Twitch (WebSocket server — existant)
    ↓  (client WS permanent)
App Tauri (en tray, tourne en background)
    ↓
Fenêtre overlay sans bordure sur l'écran de la cible
```

## Fenêtres
Deux fenêtres Tauri distinctes :

1. **Overlay** (`overlay.html`)
    - `decorations: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`
    - S'ouvre à la réception d'un événement WS, affiche le média, se referme après X secondes
    - Média supporté : GIF, image (`<img>`), vidéo (`<video>`)

2. **Settings** (`settings.html`)
    - `decorations: true` (fenêtre normale)
    - Ouverte depuis le tray icon
    - Contient : connexion Discord OAuth2, URL du WS, statut connexion, whitelist d'expéditeurs

## Communication Tauri ↔ Frontend
- **Frontend → Rust** : `invoke()` (lire/sauvegarder config, statut)
- **Rust → Frontend** : `emit()` (événement `jumpscare` avec payload `{ url, duration }`)

Payload WS reçu par Rust :
```json
{ "url": "https://cdn.exemple.com/gif.gif", "duration": 3000 }
```

## Config stockée (tauri-plugin-store)
```json
{
  "discord_token": "...",
  "ws_url": "wss://...",
  "volume": 0.8,
  "allowed_senders": ["discord_user_id_1", "discord_user_id_2"]
}
```

## Règles de développement
- **C'est Ihlane qui développe** — Claude Code assiste, suggère, explique, mais ne prend pas d'initiatives non demandées
- Ne jamais réécrire du code non concerné par la tâche en cours
- Toujours expliquer les choix techniques quand on touche au Rust (Illyes apprend Rust)
- Faire des commits logiques et atomiques
- Proposer deux approches si un choix architectural est ambigu, laisser Illyes décider
- Le frontend reste volontairement simple : pas de framework JS, pas de bundler