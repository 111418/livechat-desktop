import { invoke } from "@tauri-apps/api/core";
import { initials} from "./assets/js/utils/avatar.ts";

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

  initFriendList();
});

function initFriendList() {
  const selectionBar = document.querySelector<HTMLElement>("#selection-bar");
  const selectionCount = selectionBar?.querySelector(".selection-count");

  function updateSelectionBar() {
    const selected = document.querySelectorAll('.friend-item[data-selected="true"]');
    if (selectionCount) selectionCount.textContent = String(selected.length);
    selectionBar?.classList.toggle("is-visible", selected.length > 0);
  }

  document.querySelectorAll<HTMLElement>(".friend-item-online").forEach((item) => {
    const checkBtn = item.querySelector<HTMLButtonElement>(".select-check");
    checkBtn?.addEventListener("click", () => {
      const selected = item.dataset.selected === "true";
      item.dataset.selected = String(!selected);
      checkBtn.classList.toggle("is-empty", selected);
      item.classList.toggle("is-deselected", selected);
      updateSelectionBar();
    });

    const muteBtn = item.querySelector<HTMLButtonElement>(".mute-btn");
    const muteIcon = muteBtn?.querySelector("img");
    muteBtn?.addEventListener("click", () => {
      const muted = item.dataset.muted === "true";
      item.dataset.muted = String(!muted);
      muteBtn.classList.toggle("mute-btn-active", !muted);
      muteBtn.title = muted ? "Muter — bloque ses jumpscares" : "Réactiver les jumpscares";
      if (muteIcon) muteIcon.src = `./assets/svg/icons/bell${muted ? "" : "-off"}.svg`;
    });
  });

  updateSelectionBar();
}
