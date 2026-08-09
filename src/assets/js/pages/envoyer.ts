import {getSendContext, clearSendContext, type SendRecipient} from "../utils/send-context-store.ts";
import {getOverlaySettings} from "../utils/overlay-settings-store.ts";
import {fetchFriends} from "../services/friends.ts";
import {apiRequest, ApiError} from "../services/api.ts";
import {onSocket} from "../services/socket.ts";

type MediaState =
    | {type: "none"}
    | {type: "file"; file: File; name: string; sizeLabel: string; previewUrl: string; kind: "image" | "video"};

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} Ko`;
    return `${(kb / 1024).toFixed(1).replace(".", ",")} Mo`;
}

async function initEnvoyer() {
    const context = getSendContext();
    const overlay = getOverlaySettings();

    let recipients: SendRecipient[] = context?.recipients ? [...context.recipients] : [];
    const groupLabel = context?.groupLabel ?? null;
    let addableFriends: SendRecipient[] = [];
    const onlineIds = new Set<string>();

    let media: MediaState = {type: "none"};
    let transparent = overlay.transparent;
    let useFullVideo = false;

    const chipsEl = document.querySelector<HTMLElement>("#recipients-chips");
    const mediaPanelEl = document.querySelector<HTMLElement>("#media-panel");
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
        const chips = recipients.map((r) => {
            const offlineWarning = !onlineIds.has(r.id)
                ? `<span class="recipient-chip-offline" title="Hors ligne — l'envoi n'est pas garanti">●</span>`
                : "";
            return `
                <span class="recipient-chip" data-recipient-id="${r.id}">
                    <span class="recipient-chip-avatar" style="background:${r.color}${r.textColor ? `;color:${r.textColor}` : ""}">${r.initials}</span>
                    ${r.name}${offlineWarning}
                    <button type="button" class="recipient-chip-remove" data-remove-recipient="${r.id}" aria-label="Retirer ${r.name}">✕</button>
                </span>
            `;
        }).join("");

        const addableLeft = addableFriends.filter((f) => !recipients.some((r) => r.id === f.id));
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
                const friend = addableFriends.find((f) => f.id === option.dataset.addFriendId);
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
            file,
            name: file.name,
            sizeLabel: formatSize(file.size),
            previewUrl: URL.createObjectURL(file),
            kind: file.type.startsWith("video/") ? "video" : "image",
        };
        fileInput.value = "";
        renderMediaPanel();
        refreshSubmitState();
    });

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

    submitBtn?.addEventListener("click", async () => {
        if (submitBtn.disabled || media.type !== "file") return;

        submitBtn.disabled = true;
        const originalLabel = submitBtn.textContent;
        submitBtn.textContent = "Envoi en cours…";

        const form = new FormData();
        form.append("file", media.file);
        if (messageInput?.value.trim()) form.append("message", messageInput.value.trim());
        form.append("transparent", String(transparent));
        if (!useFullVideo) {
            form.append("duration", String(Number(durationSlider?.value ?? 40) / 10));
        }

        const ids = recipients.map((r) => r.id).join(",");

        try {
            await apiRequest(`/send-to/${ids}`, {method: "POST", formData: form});

            submitBtn.classList.add("is-sent");
            submitBtn.textContent = "✓ Envoyé";
            clearSendContext();

            window.setTimeout(() => {
                window.location.href = "./index.html";
            }, 900);
        } catch (err) {
            const message = err instanceof ApiError
                ? err.message
                : "Impossible d'envoyer le jumpscare.";
            window.alert(message);
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
        }
    });

    onSocket("friends_online", (list) => {
        onlineIds.clear();
        list.forEach((p) => onlineIds.add(p.user_id));
        renderRecipients();
    });
    onSocket("friend_online", (p) => {
        onlineIds.add(p.user_id);
        renderRecipients();
    });
    onSocket("friend_offline", (p) => {
        onlineIds.delete(p.user_id);
        renderRecipients();
    });

    renderRecipients();
    renderMediaPanel();
    renderTransparentToggle();
    refreshSubmitState();

    try {
        addableFriends = await fetchFriends();
        renderRecipients();
    } catch {
        // liste d'amis indisponible — on garde uniquement les destinataires déjà présélectionnés
    }
}

initEnvoyer();
