import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { getServerUrl, setServerUrl, setToken } from "../services/config.ts";

function normalizeUrl(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, "");
    return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export async function initLogin() {
    const urlInput = document.querySelector<HTMLInputElement>("#server-url");
    const testBtn = document.querySelector<HTMLButtonElement>("#test-btn");
    const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn");
    const statusEl = document.querySelector<HTMLElement>("#login-status");

    if (!urlInput || !testBtn || !connectBtn) return;

    const savedUrl = await getServerUrl();
    if (savedUrl) urlInput.value = savedUrl;

    function showStatus(message: string, isError: boolean) {
        if (!statusEl) return;
        statusEl.hidden = false;
        statusEl.textContent = message;
        statusEl.style.color = isError ? "rgb(220,80,80)" : "rgb(120,200,140)";
    }

    testBtn.addEventListener("click", async () => {
        const url = urlInput.value.trim();
        if (!url) return showStatus("Renseigne d'abord une URL de serveur.", true);

        testBtn.disabled = true;
        testBtn.textContent = "Test en cours…";
        try {
            // /friends nécessite une auth, mais toute réponse HTTP (même 401)
            // prouve que le serveur est joignable — seule une erreur réseau ne l'est pas.
            await fetch(`${normalizeUrl(url)}/friends`);
            showStatus("Serveur joignable ✓", false);
        } catch {
            showStatus("Impossible de joindre ce serveur.", true);
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = "Tester la connexion";
        }
    });

    connectBtn.addEventListener("click", async () => {
        const url = urlInput.value.trim();
        if (!url) return showStatus("Renseigne d'abord une URL de serveur.", true);

        const normalized = normalizeUrl(url);
        await setServerUrl(normalized);

        connectBtn.disabled = true;
        showStatus("Ouverture de Discord dans le navigateur…", false);
        try {
            await openUrl(`${normalized}/auth/discord-login`);
        } catch {
            showStatus("Impossible d'ouvrir le navigateur système.", true);
            connectBtn.disabled = false;
        }
    });

    // Le serveur redirige vers splatt://login?token=... une fois l'auth Discord
    // terminée ; on récupère ce lien ici tant que l'app reste ouverte pendant le flow.
    await onOpenUrl(async (urls) => {
        const received = urls[0];
        if (!received) return;

        const token = new URL(received).searchParams.get("token");
        if (!token) {
            showStatus("Lien de connexion invalide.", true);
            return;
        }

        await setToken(token);
        window.location.href = "./index.html";
    });
}
