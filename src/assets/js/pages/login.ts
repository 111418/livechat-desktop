import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { getServerUrl, setServerUrl, setToken } from "../services/config.ts";
import { apiRequest, ApiError } from "../services/api.ts";

function showStatus(message: string, isError = false): void {
    const statusEl = document.querySelector<HTMLElement>("#login-status");
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
}

async function initLogin() {
    const urlInput = document.querySelector<HTMLInputElement>("#server-url");
    const testBtn = document.querySelector<HTMLButtonElement>("#test-btn");
    const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn");

    if (!urlInput) return;

    const savedUrl = await getServerUrl();
    if (savedUrl) urlInput.value = savedUrl;

    function currentUrl(): string {
        return urlInput!.value.trim().replace(/\/+$/, "");
    }

    testBtn?.addEventListener("click", async () => {
        const url = currentUrl();
        if (!url) {
            showStatus("Renseigne une URL de serveur.", true);
            return;
        }

        await setServerUrl(url);
        testBtn.disabled = true;
        showStatus("Test en cours…");

        try {
            // Une 401 JSON prouve que le serveur répond — seule une erreur réseau
            // (ApiError status 0) signifie qu'il est réellement injoignable.
            await apiRequest("/friends/", { authenticated: false });
            showStatus("Serveur joignable.");
        } catch (err) {
            if (err instanceof ApiError && err.status !== 0) {
                showStatus("Serveur joignable.");
            } else {
                showStatus("Serveur injoignable — vérifie l'URL.", true);
            }
        } finally {
            testBtn.disabled = false;
        }
    });

    connectBtn?.addEventListener("click", async () => {
        const url = currentUrl();
        if (!url) {
            showStatus("Renseigne une URL de serveur.", true);
            return;
        }

        await setServerUrl(url);
        showStatus("Redirection vers Discord…");
        await openUrl(`${url}/auth/discord-login`);
    });

    await onOpenUrl(async (urls) => {
        const url = urls[0];
        if (!url) return;

        const token = new URL(url).searchParams.get("token");
        if (!token) {
            showStatus("Connexion échouée : jeton manquant dans le lien.", true);
            return;
        }

        await setToken(token);
        window.location.href = "./index.html";
    });
}

initLogin();
