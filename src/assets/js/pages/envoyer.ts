import {getSendContext, clearSendContext, type SendRecipient} from "../utils/send-context-store.ts";
import {getOverlaySettings, type PositionId} from "../utils/overlay-settings-store.ts";

type MediaTab = "file" | "url" | "gif";

type MediaState =
    | {type: "none"}
    | {type: "file"; name: string; sizeLabel: string; previewUrl: string; kind: "image" | "video"}
    | {type: "url"; url: string}
    | {type: "gif"; label: string; emoji: string; color: string};

const POSITION_GRID: PositionId[] = [
    "top-left", "top-center", "top-right",
    "middle-left", "center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
];

const POSITION_LABELS: Record<PositionId, string> = {
    "top-left": "Haut Gauche", "top-center": "Haut Centre", "top-right": "Haut Droite",
    "middle-left": "Milieu Gauche", "center": "Centre", "middle-right": "Milieu Droite",
    "bottom-left": "Bas Gauche", "bottom-center": "Bas Centre", "bottom-right": "Bas Droite",
};

// Amis pouvant être ajoutés comme destinataire supplémentaire — à remplacer par GET /friends.
const ADDABLE_FRIENDS: SendRecipient[] = [
    {id: "nour", name: "Nour", initials: "NR", color: "#5865F2"},
    {id: "theo", name: "Théo", initials: "TH", color: "#ED6A5E"},
    {id: "maya", name: "Maya", initials: "MA", color: "#F4BD50", textColor: "#3a2a00"},
    {id: "sami", name: "Sami", initials: "SA", color: "#3a3b40"},
    {id: "lea", name: "Léa", initials: "LE", color: "#3a3b40"},
];

const MOCK_GIFS = [
    {emoji: "👻", label: "boo.gif", color: "#5865F2"},
    {emoji: "😱", label: "scream.gif", color: "#ED6A5E"},
    {emoji: "🤡", label: "clown.gif", color: "#F4BD50"},
    {emoji: "💀", label: "skull.gif", color: "#3a3b40"},
    {emoji: "🐸", label: "kermit.gif", color: "#3BA55D"},
    {emoji: "🕷️", label: "spider.gif", color: "#6441A5"},
];

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} Ko`;
    return `${(kb / 1024).toFixed(1).replace(".", ",")} Mo`;
}

function initEnvoyer() {
    const context = getSendContext();
    const overlay = getOverlaySettings();

    let recipients: SendRecipient[] = context?.recipients ? [...context.recipients] : [];
    const groupLabel = context?.groupLabel ?? null;

    let activeMediaTab: MediaTab = "file";
    let media: MediaState = {type: "none"};
    let position: PositionId = overlay.position;
    let transparent = overlay.transparent;
    let useFullVideo = false;

    const chipsEl = document.querySelector<HTMLElement>("#recipients-chips");
    const mediaTabsEl = document.querySelector<HTMLElement>("#media-tabs");
    const mediaPanelEl = document.querySelector<HTMLElement>("#media-panel");
    const positionGridEl = document.querySelector<HTMLElement>("#send-position-grid");
    const positionLabelEl = document.querySelector<HTMLElement>("#send-position-label");
    const durationSlider = document.querySelector<HTMLInputElement>("#duration-slider");
    const durationValueEl = document.querySelector<HTMLElement>("#duration-value");
    const volumeSlider = document.querySelector<HTMLInputElement>("#send-volume-slider");
    const volumeValueEl = document.querySelector<HTMLElement>("#send-volume-value");
    const transparentToggle = document.querySelector<HTMLButtonElement>("#send-transparent-toggle");
    const transparentHintEl = document.querySelector<HTMLElement>("#transparent-hint");
    const fullVideoRow = document.querySelector<HTMLElement>("#full-video-row");
    const fullVideoCheckbox = document.querySelector<HTMLInputElement>("#full-video-checkbox");
    const messageInput = document.querySelector<HTMLInputElement>("#message-input");
    const submitBtn = document.querySelector<HTMLButtonElement>("#send-jumpscare-submit");
    const footerTextEl = document.querySelector<HTMLElement>("#send-footer-text");

    if (!chipsEl || !mediaPanelEl) return;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*,video/*,.gif";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    document.addEventListener("click", () => {
        const dropdown = chipsEl!.querySelector<HTMLElement>("#add-recipient-dropdown");
        if (dropdown) dropdown.hidden = true;
    });

    function renderRecipients() {
        const chips = recipients.map((r) => `
            <span class="recipient-chip" data-recipient-id="${r.id}">
                <span class="recipient-chip-avatar" style="background:${r.color}${r.textColor ? `;color:${r.textColor}` : ""}">${r.initials}</span>
                ${r.name}
                <button type="button" class="recipient-chip-remove" data-remove-recipient="${r.id}" aria-label="Retirer ${r.name}">✕</button>
            </span>
        `).join("");

        const addableLeft = ADDABLE_FRIENDS.filter((f) => !recipients.some((r) => r.id === f.id));
        const addChip = addableLeft.length
            ? `
                <span class="add-recipient-wrap">
                    <button type="button" class="add-recipient-chip" id="add-recipient-btn">＋ Ajouter</button>
                    <div class="add-recipient-dropdown" id="add-recipient-dropdown" hidden>
                        ${addableLeft.map((f) => `
                            <button type="button" class="add-recipient-option" data-add-friend-id="${f.id}">
                                <span class="recipient-chip-avatar" style="background:${f.color}${f.textColor ? `;color:${f.textColor}` : ""}">${f.initials}</span>
                                ${f.name}
                            </button>
                        `).join("")}
                    </div>
                </span>
            `
            : "";

        const empty = !recipients.length
            ? `<span class="recipients-empty">Aucun destinataire — ajoute au moins un ami.</span>`
            : "";

        const origin = groupLabel
            ? `<span class="recipients-origin">Présélectionné depuis le groupe « ${groupLabel} »</span>`
            : "";

        chipsEl!.innerHTML = `${empty}${chips}${addChip}`;

        chipsEl!.querySelectorAll<HTMLButtonElement>("[data-remove-recipient]").forEach((btn) => {
            btn.addEventListener("click", () => {
                recipients = recipients.filter((r) => r.id !== btn.dataset.removeRecipient);
                renderRecipients();
                refreshSubmitState();
            });
        });

        const dropdown = chipsEl!.querySelector<HTMLElement>("#add-recipient-dropdown");

        chipsEl!.querySelector<HTMLButtonElement>("#add-recipient-btn")?.addEventListener("click", (e) => {
            e.stopPropagation();
            if (dropdown) dropdown.hidden = !dropdown.hidden;
        });

        dropdown?.querySelectorAll<HTMLButtonElement>("[data-add-friend-id]").forEach((option) => {
            option.addEventListener("click", () => {
                const friend = ADDABLE_FRIENDS.find((f) => f.id === option.dataset.addFriendId);
                if (!friend) return;
                recipients.push(friend);
                renderRecipients();
                refreshSubmitState();
            });
        });

        const originEl = document.querySelector<HTMLElement>("#recipients-origin-text");
        if (origin && !originEl) chipsEl!.insertAdjacentHTML("afterend", `<div id="recipients-origin-text">${origin}</div>`);
    }

    function revokePreview() {
        if (media.type === "file") URL.revokeObjectURL(media.previewUrl);
    }

    function updateFullVideoOption() {
        const isVideo = media.type === "file" && media.kind === "video";
        if (fullVideoRow) fullVideoRow.hidden = !isVideo;

        if (!isVideo) useFullVideo = false;
        if (fullVideoCheckbox) fullVideoCheckbox.checked = useFullVideo;
        if (durationSlider) durationSlider.disabled = isVideo && useFullVideo;
    }

    fullVideoCheckbox?.addEventListener("change", () => {
        useFullVideo = fullVideoCheckbox.checked;
        if (durationSlider) durationSlider.disabled = useFullVideo;
    });

    function renderMediaPanel() {
        mediaTabsEl?.querySelectorAll<HTMLButtonElement>(".media-tab").forEach((tab) => {
            tab.classList.toggle("is-active", tab.dataset.mediaTab === activeMediaTab);
        });

        if (activeMediaTab === "file") {
            if (media.type === "file") {
                mediaPanelEl!.innerHTML = `
                    <div class="media-dropzone" style="cursor:default">
                        <span class="media-type-badge">${media.kind === "video" ? "VIDÉO" : "IMAGE"}</span>
                        ${media.kind === "video"
                            ? `<video class="media-preview-video" src="${media.previewUrl}" muted autoplay loop></video>`
                            : `<img class="media-preview-img" src="${media.previewUrl}" alt="">`}
                    </div>
                    <div class="media-info-bar">
                        <span class="media-info-name">${media.name}</span>
                        <span class="media-info-meta">${media.sizeLabel}</span>
                        <button type="button" class="media-remove-btn" id="media-remove-btn">Retirer</button>
                    </div>
                `;
            } else {
                mediaPanelEl!.innerHTML = `
                    <div class="media-dropzone" id="file-dropzone">
                        <div class="media-dropzone-icon">▶</div>
                        <span class="media-dropzone-label">Aperçu du média</span>
                        <span class="media-dropzone-hint">Clique pour choisir une image ou une vidéo</span>
                    </div>
                `;
                mediaPanelEl!.querySelector("#file-dropzone")?.addEventListener("click", () => fileInput.click());
            }
        } else if (activeMediaTab === "url") {
            if (media.type === "url") {
                mediaPanelEl!.innerHTML = `
                    <div class="media-dropzone" style="cursor:default">
                        <img class="media-preview-img" src="${media.url}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Impossible de charger cette URL',className:'media-dropzone-hint'}))">
                    </div>
                    <div class="media-info-bar">
                        <span class="media-info-name" style="font-family:ui-monospace,'SF Mono',Consolas,monospace;font-size:11.5px">${media.url}</span>
                        <button type="button" class="media-remove-btn" id="media-remove-btn">Retirer</button>
                    </div>
                `;
            } else {
                mediaPanelEl!.innerHTML = `
                    <div class="media-url-form">
                        <input type="text" id="media-url-input" placeholder="https://exemple.com/media.gif" autocomplete="off">
                        <button type="button" class="button button-primary" id="media-url-load-btn" style="padding:9px 18px;font-size:13px">Charger l'aperçu</button>
                    </div>
                `;
                mediaPanelEl!.querySelector("#media-url-load-btn")?.addEventListener("click", () => {
                    const url = mediaPanelEl!.querySelector<HTMLInputElement>("#media-url-input")?.value.trim();
                    if (!url) return;
                    media = {type: "url", url};
                    renderMediaPanel();
                    refreshSubmitState();
                });
            }
        } else {
            if (media.type === "gif") {
                mediaPanelEl!.innerHTML = `
                    <div class="media-dropzone" style="cursor:default;background:${media.color}">
                        <span style="font-size:54px">${media.emoji}</span>
                    </div>
                    <div class="media-info-bar">
                        <span class="media-info-name">${media.label}</span>
                        <button type="button" class="media-remove-btn" id="media-remove-btn">Retirer</button>
                    </div>
                `;
            } else {
                mediaPanelEl!.innerHTML = `
                    <div class="gif-grid">
                        ${MOCK_GIFS.map((g) => `
                            <button type="button" class="gif-tile" style="background:${g.color}" data-gif-label="${g.label}" data-gif-emoji="${g.emoji}" data-gif-color="${g.color}">
                                ${g.emoji}
                                <span class="gif-tile-label">${g.label}</span>
                            </button>
                        `).join("")}
                    </div>
                `;
                mediaPanelEl!.querySelectorAll<HTMLButtonElement>(".gif-tile").forEach((tile) => {
                    tile.addEventListener("click", () => {
                        media = {
                            type: "gif",
                            label: tile.dataset.gifLabel!,
                            emoji: tile.dataset.gifEmoji!,
                            color: tile.dataset.gifColor!,
                        };
                        renderMediaPanel();
                        refreshSubmitState();
                    });
                });
            }
        }

        mediaPanelEl!.querySelector("#media-remove-btn")?.addEventListener("click", () => {
            revokePreview();
            media = {type: "none"};
            renderMediaPanel();
            refreshSubmitState();
        });

        updateFullVideoOption();
    }

    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        revokePreview();
        media = {
            type: "file",
            name: file.name,
            sizeLabel: formatSize(file.size),
            previewUrl: URL.createObjectURL(file),
            kind: file.type.startsWith("video/") ? "video" : "image",
        };
        fileInput.value = "";
        renderMediaPanel();
        refreshSubmitState();
    });

    mediaTabsEl?.querySelectorAll<HTMLButtonElement>(".media-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            activeMediaTab = tab.dataset.mediaTab as MediaTab;
            renderMediaPanel();
        });
    });

    function renderPositionGrid() {
        if (!positionGridEl) return;
        positionGridEl.innerHTML = POSITION_GRID.map((pos) => `<button type="button" class="position-cell${pos === position ? " is-active" : ""}" data-position="${pos}" aria-label="${pos}"></button>`).join("");
        if (positionLabelEl) positionLabelEl.textContent = POSITION_LABELS[position];

        positionGridEl.querySelectorAll<HTMLButtonElement>(".position-cell").forEach((cell) => {
            cell.addEventListener("click", () => {
                position = cell.dataset.position as PositionId;
                positionGridEl.querySelectorAll(".position-cell").forEach((c) => c.classList.remove("is-active"));
                cell.classList.add("is-active");
                if (positionLabelEl) positionLabelEl.textContent = POSITION_LABELS[position];
            });
        });
    }

    function paintSlider(slider: HTMLInputElement, value: number, max: number) {
        const pct = (value / max) * 100;
        slider.style.background = `linear-gradient(to right, rgb(var(--color-primary)) ${pct}%, rgba(255,255,255,.1) ${pct}%)`;
    }

    if (durationSlider) {
        paintSlider(durationSlider, Number(durationSlider.value), 100);
        durationSlider.addEventListener("input", () => {
            const tenths = Number(durationSlider.value);
            paintSlider(durationSlider, tenths, 100);
            if (durationValueEl) durationValueEl.textContent = `${(tenths / 10).toFixed(1).replace(".", ",")} s`;
        });
    }

    if (volumeSlider) {
        volumeSlider.value = String(overlay.volume);
        paintSlider(volumeSlider, overlay.volume, 100);
        if (volumeValueEl) volumeValueEl.textContent = `${overlay.volume}%`;
        volumeSlider.addEventListener("input", () => {
            const value = Number(volumeSlider.value);
            paintSlider(volumeSlider, value, 100);
            if (volumeValueEl) volumeValueEl.textContent = `${value}%`;
        });
    }

    function renderTransparentToggle() {
        transparentToggle?.classList.toggle("is-on", transparent);
        transparentToggle?.setAttribute("aria-pressed", String(transparent));
        if (transparentHintEl) {
            transparentHintEl.textContent = transparent
                ? "👻 Le média s'affiche seul, plein écran, fond invisible chez la cible."
                : "🖼️ Le média s'affiche dans une fenêtre avec un fond opaque chez la cible.";
        }
    }

    transparentToggle?.addEventListener("click", () => {
        transparent = !transparent;
        renderTransparentToggle();
    });

    function refreshSubmitState() {
        if (!submitBtn) return;
        submitBtn.disabled = !recipients.length || media.type === "none";
        if (footerTextEl) {
            const count = recipients.length;
            const who = count ? `à ${count} ami${count > 1 ? "s" : ""}` : "aucun destinataire";
            const via = groupLabel ? ` · groupe « ${groupLabel} »` : "";
            footerTextEl.textContent = count ? `${who}${via}` : who;
        }
    }

    submitBtn?.addEventListener("click", () => {
        if (submitBtn.disabled) return;

        const payload = {
            recipients: recipients.map((r) => r.id),
            media,
            message: messageInput?.value.trim() || null,
            duration: useFullVideo ? null : Number(durationSlider?.value ?? 40) / 10,
            useFullVideo,
            volume: Number(volumeSlider?.value ?? overlay.volume),
            position,
            transparent,
        };
        console.log("Envoi du jumpscare :", payload);

        submitBtn.disabled = true;
        submitBtn.classList.add("is-sent");
        submitBtn.textContent = "✓ Envoyé";
        clearSendContext();

        window.setTimeout(() => {
            window.location.href = "./index.html";
        }, 900);
    });

    renderRecipients();
    renderMediaPanel();
    renderPositionGrid();
    renderTransparentToggle();
    refreshSubmitState();
}

initEnvoyer();
