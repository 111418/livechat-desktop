import {initials} from "../utils/avatar.ts";
import {getAccount, setUsername, clearAccount} from "../utils/account-store.ts";
import {getOverlaySettings, setOverlaySettings, type PositionId} from "../utils/overlay-settings-store.ts";
import {getServerUrl, setServerUrl, clearToken} from "../services/config.ts";
import {apiRequest, ApiError} from "../services/api.ts";
import {getUpdateSettings, setUpdateSettings} from "../utils/update-settings-store.ts";

type Tab = "compte" | "overlay" | "serveur" | "securite";

const POSITION_GRID: PositionId[] = [
    "top-left", "top-center", "top-right",
    "middle-left", "center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
];

const POSITION_LABELS: Record<PositionId, string> = {
    "top-left": "Haut<br>Gauche",
    "top-center": "Haut<br>Centre",
    "top-right": "Haut<br>Droite",
    "middle-left": "Milieu<br>Gauche",
    "center": "Centre",
    "middle-right": "Milieu<br>Droite",
    "bottom-left": "Bas<br>Gauche",
    "bottom-center": "Bas<br>Centre",
    "bottom-right": "Bas<br>Droite",
};

const account = getAccount();
let serverUrl = "";

const overlaySettings = getOverlaySettings();
const updateSettings = getUpdateSettings();

async function logout(): Promise<void> {
    await clearToken();
    clearAccount();
    window.location.href = "./login.html";
}

async function initAccount(): Promise<void> {
    let activeTab: Tab = "overlay";

    const navEl = document.querySelector<HTMLElement>("#settings-nav");
    const contentEl = document.querySelector<HTMLElement>("#settings-content");
    const logoutBtn = document.querySelector<HTMLButtonElement>("#logout-btn");

    if (!navEl || !contentEl) return;

    serverUrl = await getServerUrl();

    function renderNav() {
        navEl!.querySelectorAll<HTMLButtonElement>(".settings-nav-item[data-tab]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.tab === activeTab);
        });
    }

    function accountCard(): string {
        const tag = account.discordId ? account.discordId.slice(-4) : "----";
        return `
            <div class="settings-card">
                <div class="settings-avatar">${account.avatarUrl ? `<img src="${account.avatarUrl}" alt="" class="w-full h-full rounded-full object-cover">` : account.username ? initials(account.username) : ""}</div>
                <div class="settings-name-col">
                    <span class="settings-name">${account.username}</span>
                    <span class="settings-subtext">Discord · #${tag}</span>
                </div>
                <button type="button" class="settings-btn settings-btn-danger" id="account-logout-btn">Déconnexion</button>
            </div>
        `;
    }

    function serverCard(): string {
        return `
            <div class="settings-card">
                <span class="settings-icon-badge">🛰</span>
                <div class="settings-name-col">
                    <span class="settings-name" style="font-size:12.5px">Serveur</span>
                    <span class="settings-subtext" style="font-family:ui-monospace,'SF Mono',Consolas,monospace">${serverUrl || "Non configuré"}</span>
                </div>
                <button type="button" class="settings-btn" id="server-change-btn">Changer</button>
            </div>
        `;
    }

    function renderCompteTab(): string {
        return `
            ${accountCard()}
            <div class="settings-card-column">
                <div class="settings-section-label" style="margin-bottom:10px">Changer de pseudo</div>
                <div class="settings-inline-form" style="margin-top:0">
                    <input type="text" id="username-input" class="settings-input" value="${account.username}" autocomplete="off">
                    <button type="button" class="button button-primary" id="username-save-btn" style="padding:8px 16px;font-size:13px">Enregistrer</button>
                </div>
            </div>
        `;
    }

    function renderServeurTab(): string {
        return `
            ${serverCard()}
            <div id="server-edit-zone"></div>
        `;
    }

    function renderOverlayTab(): string {
        return `
            <div class="settings-section-label">Overlay</div>
            <div class="settings-card">
                <div class="settings-name-col">
                    <span class="settings-name" style="font-size:13.5px">Mode transparent</span>
                    <span class="settings-subtext" style="font-weight:500;max-width:330px">Le média s'affiche seul, plein écran, fond invisible</span>
                </div>
                <button type="button" class="settings-toggle${overlaySettings.transparent ? " is-on" : ""}" id="transparent-toggle" aria-pressed="${overlaySettings.transparent}">
                    <span class="settings-toggle-knob"></span>
                </button>
            </div>
            <div class="overlay-row">
                <div class="settings-card-column">
                    <div class="settings-name" style="margin-bottom:10px">Position du livechat</div>
                    <div class="position-picker-row">
                        <div class="position-grid" id="position-grid">
                            ${POSITION_GRID.map((pos) => `<button type="button" class="position-cell${pos === overlaySettings.position ? " is-active" : ""}" data-position="${pos}" aria-label="${pos}"></button>`).join("")}
                        </div>
                        <span class="position-label" id="position-label">${POSITION_LABELS[overlaySettings.position]}</span>
                    </div>
                </div>
                <div class="settings-card-column volume-card">
                    <div class="settings-name" style="margin-bottom:12px">Volume des jumpscares</div>
                    <div class="volume-row">
                        <input type="range" min="0" max="100" value="${overlaySettings.volume}" class="volume-slider" id="volume-slider">
                        <span class="volume-value" id="volume-value">${overlaySettings.volume}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSecuriteTab(): string {
        return `
            ${accountCard()}
            <div class="settings-callout">
                <b>Jeton de session non révocable.</b> Le jeton émis à la connexion Discord n'expire jamais et ne peut pas être invalidé à distance — se déconnecter ici efface uniquement la session locale. En cas de doute, révoque plutôt l'autorisation depuis les paramètres Discord de ton compte.
            </div>
            <div class="settings-card" style="margin-top:12px">
                <div class="settings-name-col">
                    <span class="settings-name" style="font-size:13.5px">Mise à jour automatique</span>
                    <span class="settings-subtext" style="font-weight:500;max-width:330px">Installe les nouvelles versions sans demander (sinon, une confirmation te sera proposée à chaque nouvelle version).</span>
                </div>
                <button type="button" class="settings-toggle${updateSettings.autoUpdate ? " is-on" : ""}" id="auto-update-toggle" aria-pressed="${updateSettings.autoUpdate}">
                    <span class="settings-toggle-knob"></span>
                </button>
            </div>
        `;
    }

    function wireVolumeSlider() {
        const slider = contentEl!.querySelector<HTMLInputElement>("#volume-slider");
        const valueEl = contentEl!.querySelector<HTMLElement>("#volume-value");

        function paint(value: number) {
            slider!.style.background = `linear-gradient(to right, rgb(var(--color-primary)) ${value}%, rgba(255,255,255,.1) ${value}%)`;
            if (valueEl) valueEl.textContent = `${value}%`;
        }

        if (slider) {
            paint(overlaySettings.volume);
            slider.addEventListener("input", () => {
                overlaySettings.volume = Number(slider.value);
                paint(overlaySettings.volume);
                setOverlaySettings(overlaySettings);
            });
        }
    }

    function wirePositionGrid() {
        const grid = contentEl!.querySelector<HTMLElement>("#position-grid");
        const label = contentEl!.querySelector<HTMLElement>("#position-label");

        grid?.querySelectorAll<HTMLButtonElement>(".position-cell").forEach((cell) => {
            cell.addEventListener("click", () => {
                overlaySettings.position = cell.dataset.position as PositionId;
                grid.querySelectorAll(".position-cell").forEach((c) => c.classList.remove("is-active"));
                cell.classList.add("is-active");
                if (label) label.innerHTML = POSITION_LABELS[overlaySettings.position];
                setOverlaySettings(overlaySettings);
            });
        });
    }

    function wireTransparentToggle() {
        const toggle = contentEl!.querySelector<HTMLButtonElement>("#transparent-toggle");
        toggle?.addEventListener("click", () => {
            overlaySettings.transparent = !overlaySettings.transparent;
            toggle.classList.toggle("is-on", overlaySettings.transparent);
            toggle.setAttribute("aria-pressed", String(overlaySettings.transparent));
            setOverlaySettings(overlaySettings);
        });
    }

    function wireAutoUpdateToggle() {
        const toggle = contentEl!.querySelector<HTMLButtonElement>("#auto-update-toggle");
        toggle?.addEventListener("click", () => {
            updateSettings.autoUpdate = !updateSettings.autoUpdate;
            toggle.classList.toggle("is-on", updateSettings.autoUpdate);
            toggle.setAttribute("aria-pressed", String(updateSettings.autoUpdate));
            setUpdateSettings(updateSettings);
        });
    }

    function wireUsernameForm() {
        const input = contentEl!.querySelector<HTMLInputElement>("#username-input");
        const saveBtn = contentEl!.querySelector<HTMLButtonElement>("#username-save-btn");
        saveBtn?.addEventListener("click", async () => {
            const value = input?.value.trim();
            if (!value) return;

            saveBtn.disabled = true;
            try {
                await apiRequest("/auth/username", {method: "PATCH", body: {username: value}});
                account.username = value;
                setUsername(value);
                renderContent();
            } catch (err) {
                alert(err instanceof ApiError ? err.message : "Erreur lors de la mise à jour du pseudo.");
                saveBtn.disabled = false;
            }
        });
    }

    function wireServerChange() {
        contentEl!.querySelector<HTMLButtonElement>("#server-change-btn")?.addEventListener("click", () => {
            const zone = contentEl!.querySelector<HTMLElement>("#server-edit-zone");
            if (!zone) return;
            zone.innerHTML = `
                <div class="settings-card-column">
                    <div class="settings-section-label" style="margin-bottom:10px">Nouvelle URL du serveur</div>
                    <div class="settings-inline-form" style="margin-top:0">
                        <input type="text" id="server-url-input" class="settings-input" value="${serverUrl}" autocomplete="off">
                        <button type="button" class="button button-primary" id="server-save-btn" style="padding:8px 16px;font-size:13px">Enregistrer</button>
                    </div>
                </div>
            `;
            zone.querySelector<HTMLButtonElement>("#server-save-btn")?.addEventListener("click", async () => {
                const value = zone.querySelector<HTMLInputElement>("#server-url-input")?.value.trim();
                if (!value) return;
                await setServerUrl(value);
                serverUrl = value;
                renderContent();
            });
        });
    }

    function wireLogout() {
        contentEl!.querySelectorAll<HTMLButtonElement>("#account-logout-btn").forEach((btn) => {
            btn.addEventListener("click", () => void logout());
        });
    }

    function renderContent() {
        if (activeTab === "compte") contentEl!.innerHTML = renderCompteTab();
        else if (activeTab === "overlay") contentEl!.innerHTML = renderOverlayTab();
        else if (activeTab === "serveur") contentEl!.innerHTML = renderServeurTab();
        else contentEl!.innerHTML = renderSecuriteTab();

        wireVolumeSlider();
        wirePositionGrid();
        wireTransparentToggle();
        wireAutoUpdateToggle();
        wireUsernameForm();
        wireServerChange();
        wireLogout();
    }

    navEl.querySelectorAll<HTMLButtonElement>(".settings-nav-item[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
            activeTab = btn.dataset.tab as Tab;
            renderNav();
            renderContent();
        });
    });

    logoutBtn?.addEventListener("click", () => void logout());

    renderNav();
    renderContent();
}

void initAccount();
