import {initials} from "../utils/avatar.ts";
import {getAccount, setUsername, clearAccount} from "../utils/account-store.ts";
import {getOverlaySettings, setOverlaySettings, type PositionId} from "../utils/overlay-settings-store.ts";
import {getServerUrl, setServerUrl, clearToken, getCloseToTray, setCloseToTray, getTextScale, setTextScale} from "../services/config.ts";
import {apiRequest, ApiError} from "../services/api.ts";
import {getUpdateSettings, setUpdateSettings} from "../utils/update-settings-store.ts";
import {isEnabled as isAutostartEnabled, enable as enableAutostart, disable as disableAutostart} from "@tauri-apps/plugin-autostart";
import {fetchReleases, type ReleaseInfo} from "../services/releases.ts";
import {openUrl} from "@tauri-apps/plugin-opener";
import {fetchFriends, type RemoteFriend} from "../services/friends.ts";
import {loadPersistedGroupsData, saveGroupsData, type GroupsData} from "../utils/groups-store.ts";

type Tab = "compte" | "overlay" | "serveur" | "groupes" | "securite" | "changelog";

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
let closeToTray = true;
let autostartEnabled = false;
let textScale = 100;

// null = pas encore chargé, tableau vide = chargé mais aucune release trouvée.
let releases: ReleaseInfo[] | null = null;
let releasesError: string | null = null;

let groupsData: GroupsData | null = null;
let groupsFriends: RemoteFriend[] = [];
let groupsError: string | null = null;

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
    closeToTray = await getCloseToTray();
    textScale = await getTextScale();
    try {
        autostartEnabled = await isAutostartEnabled();
    } catch (err) {
        console.error("Impossible de lire l'état du démarrage automatique :", err);
    }

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
            <div class="settings-card" style="margin-top:12px">
                <div class="settings-name-col">
                    <span class="settings-name" style="font-size:13.5px">Rester ouvert en arrière-plan</span>
                    <span class="settings-subtext" style="font-weight:500;max-width:330px">La croix masque la fenêtre au lieu de fermer l'app, pour continuer à recevoir des jumpscares.</span>
                </div>
                <button type="button" class="settings-toggle${closeToTray ? " is-on" : ""}" id="close-to-tray-toggle" aria-pressed="${closeToTray}">
                    <span class="settings-toggle-knob"></span>
                </button>
            </div>
            <div class="settings-card" style="margin-top:12px">
                <div class="settings-name-col">
                    <span class="settings-name" style="font-size:13.5px">Démarrer avec Windows</span>
                    <span class="settings-subtext" style="font-weight:500;max-width:330px">Lance Splatt automatiquement à l'ouverture de session.</span>
                </div>
                <button type="button" class="settings-toggle${autostartEnabled ? " is-on" : ""}" id="autostart-toggle" aria-pressed="${autostartEnabled}">
                    <span class="settings-toggle-knob"></span>
                </button>
            </div>
            <div class="settings-card-column" style="margin-top:12px">
                <div class="settings-name" style="margin-bottom:12px">Taille du texte</div>
                <div class="volume-row">
                    <input type="range" min="80" max="150" step="5" value="${textScale}" class="volume-slider" id="text-scale-slider">
                    <span class="volume-value" id="text-scale-value">${textScale}%</span>
                </div>
            </div>
        `;
    }

    function escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function formatReleaseDate(iso: string): string {
        if (!iso) return "";
        return new Date(iso).toLocaleDateString("fr-FR", {day: "numeric", month: "long", year: "numeric"});
    }

    function renderChangelogTab(): string {
        if (releasesError) {
            return `<div class="settings-callout">Impossible de charger les releases : ${escapeHtml(releasesError)}</div>`;
        }
        if (releases === null) {
            return `<div class="settings-subtext">Chargement des dernières versions…</div>`;
        }
        if (releases.length === 0) {
            return `<div class="settings-subtext">Aucune release publiée pour le moment.</div>`;
        }
        return releases.map((r) => `
            <div class="settings-card-column" style="margin-bottom:12px">
                <div class="settings-name-col" style="margin-bottom:6px">
                    <span class="settings-name">${escapeHtml(r.name)}</span>
                    <span class="settings-subtext">${formatReleaseDate(r.publishedAt)}</span>
                </div>
                ${r.body ? `<div class="changelog-body">${escapeHtml(r.body)}</div>` : ""}
                <button type="button" class="settings-btn" style="margin-top:8px;margin-left:0" data-release-url="${escapeHtml(r.htmlUrl)}">Voir sur GitHub ↗</button>
            </div>
        `).join("");
    }

    function wireChangelogLinks() {
        contentEl!.querySelectorAll<HTMLButtonElement>("[data-release-url]").forEach((btn) => {
            btn.addEventListener("click", () => void openUrl(btn.dataset.releaseUrl!));
        });
    }

    async function loadChangelog() {
        if (releases !== null || releasesError) return;
        try {
            releases = await fetchReleases();
        } catch (err) {
            releasesError = err instanceof Error ? err.message : "Erreur inconnue.";
            console.error("Impossible de charger les releases GitHub :", err);
        }
        if (activeTab === "changelog") renderContent();
    }

    function renderGroupesTab(): string {
        if (groupsError) {
            return `<div class="settings-callout">Impossible de charger les groupes : ${escapeHtml(groupsError)}</div>`;
        }
        if (groupsData === null) {
            return `<div class="settings-subtext">Chargement des groupes…</div>`;
        }
        if (groupsData.groups.length === 0) {
            return `<div class="settings-subtext">Aucun groupe pour l'instant — crées-en un depuis l'accueil (bouton « + Groupe »), il apparaîtra ici pour être géré.</div>`;
        }

        const friendById = new Map(groupsFriends.map((f) => [f.discordId, f]));

        return groupsData.groups.map((group) => {
            const memberIds = Object.entries(groupsData!.membership)
                .filter(([, ids]) => ids.includes(group.id))
                .map(([discordId]) => discordId);
            const members = memberIds
                .map((id) => friendById.get(id))
                .filter((f): f is RemoteFriend => !!f);
            const nonMembers = groupsFriends.filter((f) => !memberIds.includes(f.discordId));

            return `
                <div class="settings-card-column group-manage-card" style="margin-bottom:14px" data-group-id="${group.id}">
                    <div class="group-manage-header">
                        <span class="settings-name group-name-label">${escapeHtml(group.label)}</span>
                        <input type="text" class="settings-input group-name-input" value="${escapeHtml(group.label)}" hidden>
                        <div class="group-manage-actions">
                            <button type="button" class="settings-btn group-rename-btn" title="Renommer">✏️ Renommer</button>
                            <button type="button" class="settings-btn settings-btn-danger group-delete-btn" title="Supprimer le groupe">Supprimer</button>
                        </div>
                    </div>
                    <div class="group-member-list">
                        ${members.length ? members.map((f) => `
                            <div class="group-member-row">
                                <span class="settings-avatar group-member-avatar">${f.avatarUrl ? `<img src="${f.avatarUrl}" alt="" class="w-full h-full rounded-full object-cover">` : initials(f.name)}</span>
                                <span class="group-member-name">${escapeHtml(f.name)}</span>
                                <button type="button" class="group-member-remove" data-remove-friend="${f.discordId}" title="Retirer du groupe">✕</button>
                            </div>
                        `).join("") : `<div class="settings-subtext">Aucun membre.</div>`}
                    </div>
                    ${nonMembers.length ? `
                        <div class="group-add-row">
                            <select class="settings-input group-add-select">
                                ${nonMembers.map((f) => `<option value="${f.discordId}">${escapeHtml(f.name)}</option>`).join("")}
                            </select>
                            <button type="button" class="button button-primary group-add-btn" style="padding:8px 14px;font-size:13px;white-space:nowrap">+ Ajouter</button>
                        </div>
                    ` : ""}
                </div>
            `;
        }).join("");
    }

    function wireGroupsTab() {
        const data = groupsData;
        if (!data) return;

        contentEl!.querySelectorAll<HTMLElement>(".group-manage-card").forEach((card) => {
            const groupId = card.dataset.groupId!;
            const group = data.groups.find((g) => g.id === groupId);
            if (!group) return;

            const nameLabel = card.querySelector<HTMLElement>(".group-name-label");
            const nameInput = card.querySelector<HTMLInputElement>(".group-name-input");

            card.querySelector(".group-rename-btn")?.addEventListener("click", () => {
                if (!nameLabel || !nameInput) return;
                nameLabel.hidden = true;
                nameInput.hidden = false;
                nameInput.focus();
                nameInput.select();
            });

            function saveRename() {
                if (!nameInput || !nameLabel) return;
                const value = nameInput.value.trim();
                if (value && value !== group!.label) {
                    group!.label = value;
                    void saveGroupsData(data!);
                    nameLabel.textContent = value;
                } else {
                    nameInput.value = group!.label;
                }
                nameLabel.hidden = false;
                nameInput.hidden = true;
            }
            nameInput?.addEventListener("blur", saveRename);
            nameInput?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") nameInput.blur();
                if (e.key === "Escape") {
                    nameInput.value = group!.label;
                    nameInput.blur();
                }
            });

            card.querySelector(".group-delete-btn")?.addEventListener("click", () => {
                if (!confirm(`Supprimer le groupe « ${group!.label} » ?`)) return;
                data.groups = data.groups.filter((g) => g.id !== groupId);
                for (const friendId of Object.keys(data.membership)) {
                    data.membership[friendId] = data.membership[friendId].filter((gId) => gId !== groupId);
                    if (data.membership[friendId].length === 0) delete data.membership[friendId];
                }
                void saveGroupsData(data);
                renderContent();
            });

            card.querySelectorAll<HTMLButtonElement>("[data-remove-friend]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const friendId = btn.dataset.removeFriend!;
                    data.membership[friendId] = (data.membership[friendId] ?? []).filter((gId) => gId !== groupId);
                    if (data.membership[friendId].length === 0) delete data.membership[friendId];
                    void saveGroupsData(data);
                    renderContent();
                });
            });

            card.querySelector(".group-add-btn")?.addEventListener("click", () => {
                const select = card.querySelector<HTMLSelectElement>(".group-add-select");
                const friendId = select?.value;
                if (!friendId) return;
                const current = data.membership[friendId] ?? [];
                if (!current.includes(groupId)) data.membership[friendId] = [...current, groupId];
                void saveGroupsData(data);
                renderContent();
            });
        });
    }

    async function loadGroupsTab() {
        if (groupsData !== null || groupsError) return;
        try {
            [groupsData, groupsFriends] = await Promise.all([loadPersistedGroupsData(), fetchFriends()]);
        } catch (err) {
            groupsError = err instanceof Error ? err.message : "Erreur inconnue.";
            console.error("Impossible de charger les groupes :", err);
        }
        if (activeTab === "groupes") renderContent();
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

    function wireTextScaleSlider() {
        const slider = contentEl!.querySelector<HTMLInputElement>("#text-scale-slider");
        const valueEl = contentEl!.querySelector<HTMLElement>("#text-scale-value");
        if (!slider) return;

        const min = Number(slider.min);
        const max = Number(slider.max);

        function paint(value: number) {
            const pct = ((value - min) / (max - min)) * 100;
            slider!.style.background = `linear-gradient(to right, rgb(var(--color-primary)) ${pct}%, rgba(255,255,255,.1) ${pct}%)`;
            if (valueEl) valueEl.textContent = `${value}%`;
        }

        paint(textScale);
        slider.addEventListener("input", () => {
            textScale = Number(slider.value);
            paint(textScale);
            (document.documentElement.style as CSSStyleDeclaration & {zoom: string}).zoom = `${textScale}%`;
        });
        slider.addEventListener("change", () => {
            void setTextScale(textScale);
        });
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

    function wireCloseToTrayToggle() {
        const toggle = contentEl!.querySelector<HTMLButtonElement>("#close-to-tray-toggle");
        toggle?.addEventListener("click", () => {
            closeToTray = !closeToTray;
            toggle.classList.toggle("is-on", closeToTray);
            toggle.setAttribute("aria-pressed", String(closeToTray));
            void setCloseToTray(closeToTray);
        });
    }

    function wireAutostartToggle() {
        const toggle = contentEl!.querySelector<HTMLButtonElement>("#autostart-toggle");
        toggle?.addEventListener("click", async () => {
            const next = !autostartEnabled;
            try {
                if (next) await enableAutostart();
                else await disableAutostart();
                autostartEnabled = next;
                toggle.classList.toggle("is-on", autostartEnabled);
                toggle.setAttribute("aria-pressed", String(autostartEnabled));
            } catch (err) {
                console.error("Impossible de changer le démarrage automatique :", err);
            }
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
        else if (activeTab === "changelog") contentEl!.innerHTML = renderChangelogTab();
        else if (activeTab === "groupes") contentEl!.innerHTML = renderGroupesTab();
        else contentEl!.innerHTML = renderSecuriteTab();

        wireVolumeSlider();
        wirePositionGrid();
        wireTransparentToggle();
        wireAutoUpdateToggle();
        wireCloseToTrayToggle();
        wireAutostartToggle();
        wireTextScaleSlider();
        wireUsernameForm();
        wireServerChange();
        wireLogout();
        wireChangelogLinks();
        wireGroupsTab();

        if (activeTab === "changelog") void loadChangelog();
        if (activeTab === "groupes") void loadGroupsTab();
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
