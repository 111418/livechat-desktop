import { invoke } from "@tauri-apps/api/core";
import { initials } from "./assets/js/utils/avatar.ts";
import { getAccount } from "./assets/js/utils/account-store.ts";
import { initAccueil } from "./assets/js/pages/accueil.ts";
import { initLogin } from "./assets/js/pages/login.ts";
import { onSocket } from "./assets/js/services/socket.ts";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

const account = getAccount();
const userAvatar = document.querySelector("#user-avatar");
if (userAvatar) userAvatar.textContent = initials(account.username);

const usernameDisplay = document.querySelector("#username-display");
if (usernameDisplay) usernameDisplay.textContent = account.username;

const usertagDisplay = document.querySelector("#usertag-display");
if (usertagDisplay) usertagDisplay.textContent = `#${account.tag}`;


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
  }
});
