import {listen} from "@tauri-apps/api/event";
import {invoke} from "@tauri-apps/api/core";
import type {LivechatPayload} from "../services/socket.ts";
import {getOverlaySettings} from "../utils/overlay-settings-store.ts";
import {getServerUrl} from "../services/config.ts";

const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi", "mkv"];
const DEFAULT_DURATION_SECONDS = 4;
// Quelle que soit la valeur reçue (ou son absence), l'overlay ne doit jamais
// pouvoir rester affiché indéfiniment — filet de secours en plus du timer normal.
const MAX_DURATION_SECONDS = 60;

function isVideoUrl(url: string): boolean {
    const clean = url.split("?")[0].split("#")[0];
    const ext = clean.split(".").pop()?.toLowerCase() ?? "";
    return VIDEO_EXTENSIONS.includes(ext);
}

// Les médias stockés en local (fallback si l'upload Discord échoue/dépasse la
// taille max) arrivent en chemin relatif ("/uploads/livechat/...") : sans
// origine, le navigateur les résout contre la page courante (le serveur Vite),
// pas contre le serveur Splatt — d'où un 404 silencieux et un média invisible.
async function resolveMediaUrl(url: string): Promise<string> {
    if (/^https?:\/\//i.test(url)) return url;
    const serverUrl = await getServerUrl();
    return `${serverUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

let hideTimer: number | undefined;

function hide() {
    if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = undefined;
    }
    // hide_overlay ne fait que cacher la fenêtre : sans ça, une vidéo lancée
    // continue de jouer (et de faire du bruit) en arrière-plan une fois cachée.
    const video = document.querySelector<HTMLVideoElement>("#overlay-media video");
    video?.pause();
    void invoke("hide_overlay");
}

async function showLivechat(payload: LivechatPayload) {
    const root = document.querySelector<HTMLElement>("#overlay-root");
    const mediaEl = document.querySelector<HTMLElement>("#overlay-media");
    const authorEl = document.querySelector<HTMLElement>("#overlay-author");
    const messageEl = document.querySelector<HTMLElement>("#overlay-message");
    if (!root || !mediaEl) return;

    // Position et volume sont des préférences locales de celui qui reçoit,
    // jamais envoyées par l'expéditeur (l'API ne transporte que transparent/duration).
    const settings = getOverlaySettings();
    root.dataset.position = settings.position;
    root.classList.toggle("is-opaque", payload.transparent === false);

    if (authorEl) {
        authorEl.textContent = payload.author_name;
        authorEl.hidden = !payload.author_name;
    }

    const isVideo = isVideoUrl(payload.url);
    const mediaUrl = await resolveMediaUrl(payload.url);
    mediaEl.innerHTML = isVideo
        ? `<video src="${mediaUrl}" autoplay></video>`
        : `<img src="${mediaUrl}" alt="">`;

    const mediaElement = mediaEl.querySelector<HTMLVideoElement | HTMLImageElement>("video, img")!;

    if (isVideo) {
        const video = mediaElement as HTMLVideoElement;
        video.volume = Math.min(Math.max(settings.volume, 0), 100) / 100;
        // Une vidéo sans boucle qui se termine avant le timer ferme l'overlay
        // tout de suite (couvre le cas "vidéo entière", sans durée envoyée).
        video.addEventListener("ended", hide);
    }

    if (messageEl) {
        messageEl.textContent = payload.message ?? "";
        messageEl.hidden = !payload.message;
    }

    if (hideTimer) window.clearTimeout(hideTimer);
    const hasExplicitDuration = typeof payload.duration === "number" && payload.duration > 0;
    // Vidéo sans durée explicite ("vidéo entière") : pas de coupure arbitraire à
    // 4s, on laisse l'event "ended" ci-dessus faire le travail, avec le plafond
    // ci-dessous comme seul filet de secours si la vidéo ne se termine jamais.
    const fallback = isVideo ? MAX_DURATION_SECONDS : DEFAULT_DURATION_SECONDS;
    const duration = Math.min(hasExplicitDuration ? (payload.duration as number) : fallback, MAX_DURATION_SECONDS);

    // Le décompte ne démarre qu'une fois le média réellement affichable : sinon,
    // pour un média plus long à charger couplé à une durée courte, hide()
    // pouvait se déclencher avant qu'une seule image ne s'affiche.
    let started = false;
    const startCountdown = () => {
        if (started) return;
        started = true;
        hideTimer = window.setTimeout(hide, duration * 1000);
    };
    mediaElement.addEventListener(isVideo ? "loadeddata" : "load", startCountdown, {once: true});
    // Filet de secours si l'event de chargement ne se déclenche jamais (URL cassée, etc.).
    window.setTimeout(startCountdown, 3000);
}

void listen<LivechatPayload>("livechat", (event) => {
    void showLivechat(event.payload);
});
