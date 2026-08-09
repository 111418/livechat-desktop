import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LivechatPayload {
    url: string;
    message?: string;
    transparent?: boolean;
    duration?: number;
    author_discord_id: string;
    author_name: string;
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv"];
const DEFAULT_DURATION_S = 4;

function isVideoUrl(url: string): boolean {
    const pathname = url.split("?")[0].toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

let hideTimer: number | undefined;

function showJumpscare(payload: LivechatPayload) {
    const root = document.querySelector<HTMLElement>("#overlay-root");
    const mediaEl = document.querySelector<HTMLElement>("#overlay-media");
    const messageEl = document.querySelector<HTMLElement>("#overlay-message");
    if (!root || !mediaEl) return;

    root.classList.toggle("is-opaque", payload.transparent === false);

    mediaEl.innerHTML = isVideoUrl(payload.url)
        ? `<video src="${payload.url}" autoplay muted loop></video>`
        : `<img src="${payload.url}" alt="">`;

    if (messageEl) {
        if (payload.message) {
            messageEl.hidden = false;
            messageEl.textContent = payload.message;
        } else {
            messageEl.hidden = true;
        }
    }

    if (hideTimer) window.clearTimeout(hideTimer);
    // Le serveur ne borne pas "duration" (cf. doc API §9) — valeur par défaut
    // raisonnable si elle est absente, nulle ou négative.
    const durationS = payload.duration && payload.duration > 0 ? payload.duration : DEFAULT_DURATION_S;
    hideTimer = window.setTimeout(() => {
        invoke("hide_overlay");
    }, durationS * 1000);
}

listen<LivechatPayload>("livechat", (event) => {
    showJumpscare(event.payload);
});
