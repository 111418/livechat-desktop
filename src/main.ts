import { invoke } from "@tauri-apps/api/core";
import { initials } from "./assets/js/utils/avatar.ts";
import { getAccount } from "./assets/js/utils/account-store.ts";
import { initAccueil } from "./assets/js/pages/accueil.ts";

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
});
