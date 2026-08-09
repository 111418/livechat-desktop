import { invoke } from "@tauri-apps/api/core";
import { initials } from "./assets/js/utils/avatar.ts";
import { getAccount, setAccount, type Account } from "./assets/js/utils/account-store.ts";
import { initAccueil } from "./assets/js/pages/accueil.ts";
import { initLogin } from "./assets/js/pages/login.ts";
import { onSocket } from "./assets/js/services/socket.ts";
import { fetchMe } from "./assets/js/services/me.ts";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

function renderAccount(account: Account) {
  const userAvatar = document.querySelector("#user-avatar");
  if (userAvatar) userAvatar.textContent = initials(account.username || account.discordId);

  const usernameDisplay = document.querySelector("#username-display");
  if (usernameDisplay) usernameDisplay.textContent = account.username || account.discordId;

  const usertagDisplay = document.querySelector("#usertag-display");
  if (usertagDisplay) usertagDisplay.textContent = account.discordId ? `#${account.discordId.slice(-4)}` : "";
}

// Peint le cache local tout de suite (pas d'attente réseau), puis rafraîchit
// depuis GET /auth/me — la source de vérité reste toujours le backend.
renderAccount(getAccount());

async function greet() {
  if (greetMsgEl && greetInputEl) {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });

  if (document.querySelector("#friend-list")) {
    initAccueil();
  }

  if (document.querySelector("#server-url")) {
    initLogin();
  } else {
    // Sur toutes les pages authentifiées (jamais sur login.html), on écoute le
    // jumpscare reçu par socket et on délègue son affichage plein écran à la
    // fenêtre overlay dédiée, gérée côté Rust.
    onSocket("livechat", (payload) => {
      invoke("show_overlay", { payload });
    });

    fetchMe()
      .then((me) => {
        const account: Account = { username: me.username || "", discordId: me.discord_id };
        setAccount(account);
        renderAccount(account);
      })
      .catch(() => {
        // Pas de session valide (token expiré/révoqué côté serveur) — on garde
        // l'affichage en cache, rien de plus à faire ici.
      });
  }
});
