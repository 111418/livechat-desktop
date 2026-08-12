import {check} from "@tauri-apps/plugin-updater";
import {relaunch} from "@tauri-apps/plugin-process";
import {getUpdateSettings} from "../utils/update-settings-store.ts";

// Ne vérifie/affiche que sur les pages qui ont une modal-root (accueil pour
// l'instant) : pas la peine de dupliquer la logique de popup partout.
export async function checkForUpdate(): Promise<void> {
    let update;
    try {
        update = await check();
    } catch (err) {
        console.error("Vérification de mise à jour impossible :", err);
        return;
    }
    if (!update) return;

    if (getUpdateSettings().autoUpdate) {
        try {
            await update.downloadAndInstall();
            await relaunch();
        } catch (err) {
            console.error("Mise à jour automatique échouée :", err);
        }
        return;
    }

    promptUpdate(update);
}

function promptUpdate(update: {version: string; currentVersion: string; body?: string; downloadAndInstall: () => Promise<void>}) {
    const modalRoot = document.querySelector<HTMLElement>("#modal-root");
    if (!modalRoot) return;

    modalRoot.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-panel">
                <div class="modal-header">
                    <span>Mise à jour disponible</span>
                    <button type="button" class="modal-close" aria-label="Fermer">✕</button>
                </div>
                <p class="modal-message">
                    Une nouvelle version de Splatt est disponible (v${update.version}, tu as v${update.currentVersion}).
                    ${update.body ? `<br><br>${update.body}` : ""}
                </p>
                <div class="modal-footer">
                    <button type="button" class="button button-secondary" id="update-later-btn">Plus tard</button>
                    <button type="button" class="button button-primary" id="update-now-btn">Mettre à jour</button>
                </div>
            </div>
        </div>
    `;

    function close() {
        if (modalRoot) modalRoot.innerHTML = "";
    }

    const overlay = modalRoot.querySelector<HTMLElement>(".modal-overlay");
    overlay?.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
    modalRoot.querySelector(".modal-close")?.addEventListener("click", close);
    modalRoot.querySelector("#update-later-btn")?.addEventListener("click", close);

    modalRoot.querySelector("#update-now-btn")?.addEventListener("click", async () => {
        const btn = modalRoot.querySelector<HTMLButtonElement>("#update-now-btn");
        const messageEl = modalRoot.querySelector<HTMLElement>(".modal-message");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Téléchargement…";
        }
        try {
            await update.downloadAndInstall();
            await relaunch();
        } catch (err) {
            console.error("Mise à jour échouée :", err);
            if (messageEl) messageEl.textContent = "La mise à jour a échoué. Réessaie plus tard.";
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Réessayer";
            }
        }
    });
}
