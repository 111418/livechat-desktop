import {getSendContext, clearSendContext, type SendRecipient} from "../utils/send-context-store.ts";
import {getOverlaySettings} from "../utils/overlay-settings-store.ts";
import {fetchFriends} from "../services/friends.ts";
import {apiRequest, ApiError} from "../services/api.ts";
import {connectSocket, onSocket, type FriendPresencePayload} from "../services/socket.ts";

type MediaState =
    | {type: "none"}
    | {type: "file"; file: File; name: string; sizeLabel: string; previewUrl: string; kind: "image" | "video"};

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
    let addableFriends: SendRecipient[] = [];

    // Pas de snapshot de présence côté API : on ne signale hors-ligne que les
    // amis vus explicitement déconnectés pendant cette session (pas de faux positifs).
    const offlineIds = new Set<string>();

    let media: MediaState = {type: "none"};
    let transparent = overlay.transparent;
    let useFullVideo = false;
    // Passage choisi dans la vidéo source (poignées du timeline), en secondes.
    // Sans rapport avec les images, qui utilisent le slider "Durée" classique.
    let trimStart = 0;
    let trimEnd = 4;
    let videoDuration = 10;
    const MIN_TRIM_SECONDS = 0.5;
    const MAX_TRIM_SECONDS = 10;
    let previewStopTimer: number | undefined;

    const chipsEl = document.querySelector<HTMLElement>("#recipients-chips");
    const mediaPanelEl = document.querySelector<HTMLElement>("#media-panel");
    const durationSlider = document.querySelector<HTMLInputElement>("#duration-slider");
    const durationValueEl = document.querySelector<HTMLElement>("#duration-value");
    const transparentToggle = document.querySelector<HTMLButtonElement>("#send-transparent-toggle");
    const transparentHintEl = document.querySelector<HTMLElement>("#transparent-hint");
    const fullVideoCheckbox = document.querySelector<HTMLInputElement>("#full-video-checkbox");
    const durationBlock = document.querySelector<HTMLElement>("#duration-block");
    const trimBlock = document.querySelector<HTMLElement>("#trim-block");
    const trimTrack = document.querySelector<HTMLElement>("#trim-track");
    const trimWindow = document.querySelector<HTMLElement>("#trim-window");
    const trimHandleStart = document.querySelector<HTMLElement>("#trim-handle-start");
    const trimHandleEnd = document.querySelector<HTMLElement>("#trim-handle-end");
    const trimValueEl = document.querySelector<HTMLElement>("#trim-value");
    const previewBtn = document.querySelector<HTMLButtonElement>("#preview-btn");
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

    function chipAvatar(r: SendRecipient): string {
        return r.avatarUrl
            ? `<img src="${r.avatarUrl}" alt="" class="w-full h-full rounded-full object-cover">`
            : r.initials;
    }

    function renderRecipients() {
        const chips = recipients.map((r) => {
            const isOffline = offlineIds.has(r.id);
            return `
            <span class="recipient-chip${isOffline ? " recipient-chip-offline" : ""}" data-recipient-id="${r.id}"${isOffline ? ` title="App fermée — l'envoi n'est pas garanti"` : ""}>
                <span class="recipient-chip-avatar" style="background:${r.color}${r.textColor ? `;color:${r.textColor}` : ""}">${chipAvatar(r)}</span>
                ${isOffline ? `<span class="recipient-chip-offline-dot"></span>` : ""}
                ${r.name}
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
                                <span class="recipient-chip-avatar" style="background:${f.color}${f.textColor ? `;color:${f.textColor}` : ""}">${chipAvatar(f)}</span>
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
        // Les images n'ont pas de passage à choisir : elles gardent le slider
        // "Durée" classique, les vidéos passent sur le timeline à poignées.
        if (durationBlock) durationBlock.hidden = isVideo;
        if (trimBlock) trimBlock.hidden = !isVideo;

        if (!isVideo) useFullVideo = false;
        if (fullVideoCheckbox) fullVideoCheckbox.checked = useFullVideo;
        trimBlock?.classList.toggle("is-disabled", useFullVideo);
    }

    fullVideoCheckbox?.addEventListener("change", () => {
        useFullVideo = fullVideoCheckbox.checked;
        trimBlock?.classList.toggle("is-disabled", useFullVideo);
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

    function setMediaFromFile(file: File) {
        revokePreview();
        const kind = file.type.startsWith("video/") ? "video" : "image";
        media = {
            type: "file",
            file,
            name: file.name,
            sizeLabel: formatSize(file.size),
            previewUrl: URL.createObjectURL(file),
            kind,
        };
        renderMediaPanel();
        refreshSubmitState();

        if (kind === "video") {
            const probeUrl = media.previewUrl;
            const probe = document.createElement("video");
            probe.preload = "metadata";
            probe.src = probeUrl;
            probe.addEventListener("loadedmetadata", () => {
                // Le fichier a pu changer pendant le chargement des métadonnées.
                if (media.type !== "file" || media.previewUrl !== probeUrl) return;
                videoDuration = probe.duration;
                trimStart = 0;
                trimEnd = Math.min(4, videoDuration);
                paintTrim();
            }, {once: true});
        }
    }

    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        setMediaFromFile(file);
        fileInput.value = "";
    });

    // Coller une image (ex. capture d'écran Win+Shift+S encore dans le
    // presse-papier) directement dans la page, sans avoir à la sauvegarder
    // sur le disque puis la choisir via le sélecteur de fichier.
    document.addEventListener("paste", (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (!item.type.startsWith("image/")) continue;
            const file = item.getAsFile();
            if (!file) continue;
            e.preventDefault();
            // Le presse-papier ne donne pas toujours un nom de fichier utile.
            const named = new File([file], file.name || `image-collee.${file.type.split("/")[1] ?? "png"}`, {type: file.type});
            setMediaFromFile(named);
            break;
        }
    });

    function paintSlider(slider: HTMLInputElement, value: number, max: number) {
        const pct = (value / max) * 100;
        slider.style.background = `linear-gradient(to right, rgb(var(--color-primary)) ${pct}%, rgba(255,255,255,.1) ${pct}%)`;
    }

    function applyDurationSlider(tenths: number) {
        if (!durationSlider) return;
        durationSlider.value = String(tenths);
        paintSlider(durationSlider, tenths, 100);
        if (durationValueEl) durationValueEl.textContent = `${(tenths / 10).toFixed(1).replace(".", ",")} s`;
    }

    if (durationSlider) {
        applyDurationSlider(Number(durationSlider.value));
        durationSlider.addEventListener("input", () => applyDurationSlider(Number(durationSlider!.value)));
    }

    function clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    function paintTrim() {
        if (!trimWindow || !trimValueEl || videoDuration <= 0) return;
        const leftPct = (trimStart / videoDuration) * 100;
        const widthPct = ((trimEnd - trimStart) / videoDuration) * 100;
        trimWindow.style.left = `${leftPct}%`;
        trimWindow.style.width = `${widthPct}%`;
        const dur = trimEnd - trimStart;
        trimValueEl.textContent = `${trimStart.toFixed(1).replace(".", ",")} s → ${trimEnd.toFixed(1).replace(".", ",")} s (${dur.toFixed(1).replace(".", ",")} s)`;
    }

    function setTrimStart(next: number) {
        const capped = clamp(next, 0, trimEnd - MIN_TRIM_SECONDS);
        trimStart = Math.max(capped, trimEnd - MAX_TRIM_SECONDS);
        paintTrim();
    }

    function setTrimEnd(next: number) {
        const capped = clamp(next, trimStart + MIN_TRIM_SECONDS, videoDuration);
        trimEnd = Math.min(capped, trimStart + MAX_TRIM_SECONDS);
        paintTrim();
    }

    function secondsPerPixel(): number {
        const width = trimTrack?.getBoundingClientRect().width ?? 0;
        return width > 0 ? videoDuration / width : 0;
    }

    // Glisser une poignée déplace uniquement son bord (bornée par l'autre
    // bord + une largeur mini/maxi) ; glisser la zone déplace les deux bords
    // ensemble, largeur inchangée.
    function startTrimDrag(mode: "start" | "end" | "move", downEvent: PointerEvent) {
        if (trimBlock?.classList.contains("is-disabled")) return;
        downEvent.preventDefault();
        // Capture le pointeur sur l'élément cliqué : sans ça, le drag peut
        // décrocher (ne plus suivre la souris) dès qu'elle bouge vite ou
        // sort des poignées, qui sont fines (12px).
        const target = downEvent.target as Element;
        target.setPointerCapture?.(downEvent.pointerId);

        const startX = downEvent.clientX;
        const initStart = trimStart;
        const initEnd = trimEnd;
        const width = initEnd - initStart;

        function onMove(moveEvent: PointerEvent) {
            const deltaSec = (moveEvent.clientX - startX) * secondsPerPixel();
            if (mode === "start") {
                setTrimStart(initStart + deltaSec);
            } else if (mode === "end") {
                setTrimEnd(initEnd + deltaSec);
            } else {
                const newStart = clamp(initStart + deltaSec, 0, videoDuration - width);
                trimStart = newStart;
                trimEnd = newStart + width;
                paintTrim();
            }
        }
        function onUp() {
            target.releasePointerCapture?.(downEvent.pointerId);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, {once: true});
    }

    trimHandleStart?.addEventListener("pointerdown", (e) => startTrimDrag("start", e));
    trimHandleEnd?.addEventListener("pointerdown", (e) => startTrimDrag("end", e));
    trimWindow?.addEventListener("pointerdown", (e) => {
        // Les poignées sont des enfants de trim-window : leur propre listener
        // a déjà géré le drag, on évite de déclencher aussi un "move" ici.
        if (e.target === trimHandleStart || e.target === trimHandleEnd) return;
        startTrimDrag("move", e);
    });
    // Cliquer directement sur la piste (en dehors de la petite fenêtre de
    // sélection) déplaçait la sélection nulle part avant ça : rien n'était
    // câblé dessus, donc cliquer "au milieu" d'une longue vidéo ne faisait
    // rien et donnait l'impression que le trim restait bloqué au début.
    trimTrack?.addEventListener("pointerdown", (e) => {
        if (e.target !== trimTrack) return; // clic sur la fenêtre/poignée : déjà géré au-dessus
        if (trimBlock?.classList.contains("is-disabled")) return;
        const rect = trimTrack.getBoundingClientRect();
        if (rect.width <= 0) return;
        const clickedSec = ((e.clientX - rect.left) / rect.width) * videoDuration;
        const width = trimEnd - trimStart;
        const newStart = clamp(clickedSec - width / 2, 0, videoDuration - width);
        trimStart = newStart;
        trimEnd = newStart + width;
        paintTrim();
        startTrimDrag("move", e);
    });

    previewBtn?.addEventListener("click", () => {
        const video = mediaPanelEl!.querySelector<HTMLVideoElement>(".media-preview-video");
        if (!video) return;

        window.clearTimeout(previewStopTimer);
        video.loop = false;
        video.muted = false;
        video.currentTime = trimStart;
        void video.play();

        previewStopTimer = window.setTimeout(() => {
            video.pause();
            video.loop = true;
            video.muted = true;
        }, (trimEnd - trimStart) * 1000);
    });

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

        const form = new FormData();
        form.append("file", media.file, media.name);

        const message = messageInput?.value.trim();
        if (message) form.append("message", message);
        form.append("transparent", String(transparent));
        if (!useFullVideo) {
            const isVideo = media.kind === "video";
            const duration = isVideo ? trimEnd - trimStart : Number(durationSlider?.value ?? 40) / 10;
            form.append("duration", String(duration));
            if (isVideo && trimStart > 0) {
                form.append("offset", String(trimStart));
            }
        }

        const ids = recipients.map((r) => r.id).join(",");

        submitBtn.disabled = true;
        try {
            await apiRequest(`/send-to/${ids}`, {method: "POST", formData: form});

            submitBtn.classList.add("is-sent");
            submitBtn.textContent = "✓ Envoyé";
            // Le serveur ne dit jamais si c'est vraiment arrivé (app fermée,
            // ami qui t'a mute côté lui...) — ni nous, donc on ne prétend pas
            // le contraire plutôt que d'inventer un statut "muté" qu'on ne
            // peut pas connaître (et que la plupart des apps cachent exprès).
            if (footerTextEl) footerTextEl.textContent = "Livraison non garantie — le destinataire doit avoir l'app ouverte.";
            clearSendContext();

            window.setTimeout(() => {
                window.location.href = "./index.html";
            }, 900);
        } catch (err) {
            submitBtn.disabled = false;
            if (err instanceof ApiError && err.status === 403) {
                alert("Tu ne peux envoyer un jumpscare qu'à des amis.");
            } else {
                alert(err instanceof ApiError ? err.message : "Erreur lors de l'envoi du jumpscare.");
            }
        }
    });

    async function loadAddableFriends() {
        try {
            const remote = await fetchFriends();
            addableFriends = remote.map((f) => ({
                id: f.discordId,
                name: f.name,
                initials: f.initials,
                color: f.color,
                textColor: f.textColor,
                avatarUrl: f.avatarUrl,
            }));
        } catch (err) {
            console.error("Impossible de charger les amis :", err);
        }
        renderRecipients();
    }

    // connectSocket() est ré-entrant : peu importe si main.ts l'a déjà appelé.
    void connectSocket().then(() => {
        onSocket("friend_online", (payload: FriendPresencePayload) => {
            offlineIds.delete(payload.user_id);
            renderRecipients();
        });
        onSocket("friend_offline", (payload: FriendPresencePayload) => {
            offlineIds.add(payload.user_id);
            renderRecipients();
        });
    }).catch((err) => console.error("Connexion socket impossible :", err));

    renderRecipients();
    renderMediaPanel();
    renderTransparentToggle();
    refreshSubmitState();
    void loadAddableFriends();
}

initEnvoyer();
