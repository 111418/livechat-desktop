import { invoke } from "@tauri-apps/api/core";
import { avatarUrl as buildAvatarUrl, initials } from "./assets/js/utils/avatar.ts";
import { getAccount, setAccount, type Account } from "./assets/js/utils/account-store.ts";
import { initAccueil } from "./assets/js/pages/accueil.ts";
import { isMuted } from "./assets/js/utils/muted-friends-store.ts";
import { fetchMe } from "./assets/js/services/me.ts";
import { connectSocket, onSocket, requestSetDnd, type LivechatPayload } from "./assets/js/services/socket.ts";
import { checkForUpdate } from "./assets/js/services/updater.ts";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;
// Etat local du "Ne pas déranger" — pas persisté : redémarre toujours à
// false, comme le statut en ligne lui-même (déterminé par la connexion socket).
let dndEnabled = false;

function wireDndToggle(): void {
    const btn = document.querySelector<HTMLButtonElement>("#dnd-toggle");
    btn?.addEventListener("click", () => {
        dndEnabled = !dndEnabled;
        btn.classList.toggle("is-active", dndEnabled);
        btn.setAttribute("aria-pressed", String(dndEnabled));
        requestSetDnd(dndEnabled);
    });
}

function paintAccount(account: Account): void {
    const userAvatar = document.querySelector("#user-avatar");
    if (userAvatar) {
        userAvatar.innerHTML = account.avatarUrl
            ? `<img src="${account.avatarUrl}" alt="" class="w-full h-full rounded-full object-cover">`
            : account.username ? initials(account.username) : "";
    }

    const usernameDisplay = document.querySelector("#username-display");
    if (usernameDisplay) usernameDisplay.textContent = account.username;

    const usertagDisplay = document.querySelector("#usertag-display");
    if (usertagDisplay) usertagDisplay.textContent = account.discordId ? `#${account.discordId.slice(-4)}` : "";
}

async function refreshAccount(): Promise<void> {
    try {
        const me = await fetchMe();
        const account: Account = {
            username: me.username ?? "",
            discordId: me.discord_id,
            avatarUrl: buildAvatarUrl(me.discord_id, me.avatar_hash),
        };
        setAccount(account);
        paintAccount(account);
    } catch (err) {
        console.error("Impossible de récupérer le compte :", err);
    }
}

async function greet() {
    if (greetMsgEl && greetInputEl) {
        // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
        greetMsgEl.textContent = await invoke("greet", {
            name: greetInputEl.value,
        });
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    greetInputEl = document.querySelector("#greet-input");
    greetMsgEl = document.querySelector("#greet-msg");
    document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        greet();
    });

    paintAccount(getAccount());
    void refreshAccount();

    // Connecte le socket avant d'initialiser les pages qui s'abonnent à des
    // events (accueil.ts) : onSocket() est un no-op tant que le socket n'existe pas.
    try {
        await connectSocket();
        onSocket("livechat", (payload: LivechatPayload) => {
            if (isMuted(payload.author_discord_id) || dndEnabled) return;
            void invoke("show_overlay", { payload });
        });
    } catch (err) {
        console.error("Connexion socket impossible :", err);
    }

    if (document.querySelector("#friend-list")) {
        initAccueil();
        wireDndToggle();
        void checkForUpdate();
    }
});
