import { invoke } from "@tauri-apps/api/core";
import { initials } from "./assets/js/utils/avatar.ts";
import { initAccueil } from "./assets/js/pages/accueil.ts";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

const userAvatar = document.querySelector("#user-avatar");
userAvatar!.textContent = initials("Illyes")


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
