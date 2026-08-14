import {setSendContext} from "../utils/send-context-store.ts";
import {isMuted, setMuted} from "../utils/muted-friends-store.ts";
import {fetchFriends} from "../services/friends.ts";
import {apiRequest, ApiError} from "../services/api.ts";
import {connectSocket, onSocket, requestFriendsOnline, type FriendPresencePayload, type FriendRemovedPayload, type FriendDndPayload} from "../services/socket.ts";

interface Friend {
    id: string;
    discordId: string;
    name: string;
    initials: string;
    color: string;
    textColor?: string;
    avatarUrl: string | null;
    online: boolean;
    muted: boolean;
    dnd: boolean;
    groupIds: string[];
}

interface Group {
    id: string;
    label: string;
}

const ALL_GROUP_ID = "all";

// Les groupes n'existent pas côté API — fonctionnalité 100% locale, non persistée.
const GROUPS: Group[] = [];

let FRIENDS: Friend[] = [];

function slugify(name: string): string {
    const base = name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    return base || `groupe-${Date.now()}`;
}

export function initAccueil() {
    const groupPillsEl = document.querySelector<HTMLElement>("#group-pills");
    const friendListEl = document.querySelector<HTMLElement>("#friend-list");
    const searchInput = document.querySelector<HTMLInputElement>("#friend-search");
    const countText = document.querySelector<HTMLElement>("#friend-count-text");
    const selectionBar = document.querySelector<HTMLElement>("#selection-bar");
    const selectionCount = selectionBar?.querySelector(".selection-count");
    const selectionGroupName = document.querySelector<HTMLElement>("#selection-group-name");
    const sendBtn = document.querySelector<HTMLButtonElement>("#send-jumpscare-btn");
    const addGroupBtn = document.querySelector<HTMLButtonElement>("#add-group-btn");
    const addFriendBtn = document.querySelector<HTMLButtonElement>("#add-friend-btn");
    const modalRoot = document.querySelector<HTMLElement>("#modal-root");
    const requestsNavLink = document.querySelector<HTMLElement>("#demandes-nav-link");

    if (!groupPillsEl || !friendListEl) return;

    let activeGroupId = ALL_GROUP_ID;
    let searchQuery = "";
    const selectedIds = new Set<string>();

    function groupMemberCount(groupId: string): number {
        if (groupId === ALL_GROUP_ID) return FRIENDS.length;
        return FRIENDS.filter((f) => f.groupIds.includes(groupId)).length;
    }

    function renderGroupPills() {
        const pills = [{id: ALL_GROUP_ID, label: "Tous"}, ...GROUPS];
        groupPillsEl!.innerHTML = pills.map((group) => {
            const isActive = group.id === activeGroupId;
            const deletable = isActive && group.id !== ALL_GROUP_ID;
            return `
                <span class="group-pill-wrap">
                    <button type="button" class="button ${isActive ? "button-pill-active" : "button-pill"} text-sm flex items-center" data-group-id="${group.id}">
                        ${group.label} · ${groupMemberCount(group.id)}
                    </button>
                    ${deletable ? `<button type="button" class="pill-delete-btn" data-delete-group-id="${group.id}" title="Quitter le groupe">✕</button>` : ""}
                </span>
            `;
        }).join("");

        groupPillsEl!.querySelectorAll<HTMLButtonElement>("button[data-group-id]").forEach((btn) => {
            btn.addEventListener("click", () => selectGroup(btn.dataset.groupId!));
        });

        groupPillsEl!.querySelectorAll<HTMLButtonElement>("button[data-delete-group-id]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteGroup(btn.dataset.deleteGroupId!);
            });
        });
    }

    function deleteGroup(groupId: string) {
        const group = GROUPS.find((g) => g.id === groupId);
        if (!group) return;

        openConfirmModal(`Quitter le groupe « ${group.label} » ?`, "Quitter", () => {
            const index = GROUPS.findIndex((g) => g.id === groupId);
            if (index !== -1) GROUPS.splice(index, 1);
            FRIENDS.forEach((f) => {
                f.groupIds = f.groupIds.filter((id) => id !== groupId);
            });

            if (activeGroupId === groupId) {
                activeGroupId = ALL_GROUP_ID;
                selectedIds.clear();
            }

            renderGroupPills();
            renderFriendList();
            updateSelectionBar();
        });
    }

    function renderFriendItem(friend: Friend): string {
        const selected = selectedIds.has(friend.id);
        const avatarStyle = `background:${friend.color}${friend.textColor ? `;color:${friend.textColor}` : ""}`;
        const avatarInner = friend.avatarUrl
            ? `<img src="${friend.avatarUrl}" alt="" class="w-full h-full rounded-full object-cover">`
            : friend.initials;

        if (!friend.online) {
            return `
                <div class="friend-item friend-item-offline" data-friend-id="${friend.id}">
                    <div class="friend-avatar" style="${avatarStyle}">
                        ${avatarInner}
                        <span class="friend-status-dot friend-status-dot-off"></span>
                    </div>
                    <div class="friend-name-col">
                        <span class="friend-name">${friend.name}</span>
                        <span class="friend-status-text-off">App fermée</span>
                    </div>
                </div>
            `;
        }

        const statusHtml = friend.muted
            ? `<span class="friend-status-text-muted"><img src="/assets/svg/icons/bell-off.svg" alt="" class="w-2.5 h-2.5">Muté · ne te réveillera pas</span>`
            : friend.dnd
            ? `<span class="friend-status-text-dnd">🔕 Ne pas déranger</span>`
            : `<span class="friend-status-text">App ouverte</span>`;

        return `
            <div class="friend-item friend-item-online${selected ? "" : " is-deselected"}" data-friend-id="${friend.id}" data-selected="${selected}" data-muted="${friend.muted}">
                <div class="friend-avatar" style="${avatarStyle}">
                    ${avatarInner}
                    <span class="friend-status-dot"></span>
                </div>
                <div class="friend-name-col">
                    <span class="friend-name">${friend.name}</span>
                    ${statusHtml}
                </div>
                <div class="friend-actions">
                    <button type="button" class="mute-btn${friend.muted ? " mute-btn-active" : ""}" title="${friend.muted ? "Réactiver les jumpscares" : "Muter — bloque ses jumpscares"}">
                        <img src="/assets/svg/icons/bell${friend.muted ? "-off" : ""}.svg" alt="">
                    </button>
                    <button type="button" class="select-check${selected ? "" : " is-empty"}">
                        <img src="/assets/svg/icons/check.svg" alt="">
                    </button>
                </div>
            </div>
        `;
    }

    function friendsInActiveGroup(): Friend[] {
        return activeGroupId === ALL_GROUP_ID
            ? FRIENDS
            : FRIENDS.filter((f) => f.groupIds.includes(activeGroupId));
    }

    function renderFriendList() {
        const query = searchQuery.trim().toLowerCase();
        const visible = friendsInActiveGroup().filter((f) => f.name.toLowerCase().includes(query));
        const online = visible.filter((f) => f.online);
        const offline = visible.filter((f) => !f.online);

        let html = "";
        if (online.length) {
            html += `<div class="friend-group-label">App ouverte — ${online.length}</div>`;
            html += online.map(renderFriendItem).join("");
        }
        if (offline.length) {
            html += `<div class="friend-group-label">App fermée — ${offline.length}</div>`;
            html += offline.map(renderFriendItem).join("");
        }
        if (!visible.length) {
            const reason = query ? `« ${searchQuery} »` : FRIENDS.length ? "ce groupe" : "— ajoute un ami pour commencer";
            html = `<div class="friend-empty-state">Aucun ami ne correspond à ${reason}</div>`;
        }
        friendListEl!.innerHTML = html;

        friendListEl!.querySelectorAll<HTMLElement>(".friend-item-online").forEach((item) => {
            const friendId = item.dataset.friendId!;

            item.querySelector(".select-check")?.addEventListener("click", () => {
                toggleSelection(friendId);
            });

            item.querySelector(".mute-btn")?.addEventListener("click", () => {
                toggleMute(friendId);
            });
        });

        if (countText) countText.textContent = `${online.length} ouvertes · ${visible.length} amis`;
    }

    function toggleSelection(friendId: string) {
        if (selectedIds.has(friendId)) {
            selectedIds.delete(friendId);
        } else {
            selectedIds.add(friendId);
        }
        renderFriendList();
        updateSelectionBar();
    }

    function toggleMute(friendId: string) {
        const friend = FRIENDS.find((f) => f.id === friendId);
        if (!friend) return;
        friend.muted = !friend.muted;
        setMuted(friend.discordId, friend.muted);
        renderFriendList();
    }

    function selectGroup(groupId: string) {
        activeGroupId = groupId;
        selectedIds.clear();
        if (groupId !== ALL_GROUP_ID) {
            FRIENDS.filter((f) => f.online && f.groupIds.includes(groupId)).forEach((f) => selectedIds.add(f.id));
        }
        renderGroupPills();
        renderFriendList();
        updateSelectionBar();
    }

    function updateSelectionBar() {
        const count = selectedIds.size;
        if (selectionCount) selectionCount.textContent = String(count);
        const activeGroup = GROUPS.find((g) => g.id === activeGroupId);
        if (selectionGroupName) selectionGroupName.textContent = activeGroup?.label ?? "Tous";
        selectionBar?.classList.toggle("is-visible", count > 0);
    }

    function closeModal() {
        if (modalRoot) modalRoot.innerHTML = "";
    }

    function openConfirmModal(message: string, confirmLabel: string, onConfirm: () => void) {
        if (!modalRoot) return;

        modalRoot.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-panel">
                    <div class="modal-header">
                        <span>Confirmation</span>
                        <button type="button" class="modal-close" aria-label="Fermer">✕</button>
                    </div>
                    <p class="modal-message">${message}</p>
                    <div class="modal-footer">
                        <button type="button" class="button button-secondary" id="confirm-cancel-btn">Annuler</button>
                        <button type="button" class="button button-danger" id="confirm-ok-btn">${confirmLabel}</button>
                    </div>
                </div>
            </div>
        `;

        const overlay = modalRoot.querySelector<HTMLElement>(".modal-overlay");
        overlay?.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        modalRoot.querySelector(".modal-close")?.addEventListener("click", closeModal);
        modalRoot.querySelector("#confirm-cancel-btn")?.addEventListener("click", closeModal);
        modalRoot.querySelector("#confirm-ok-btn")?.addEventListener("click", () => {
            closeModal();
            onConfirm();
        });
    }

    function openCreateGroupModal() {
        if (!modalRoot) return;
        const pickedIds = new Set<string>();

        modalRoot.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-panel">
                    <div class="modal-header">
                        <span>Nouveau groupe</span>
                        <button type="button" class="modal-close" aria-label="Fermer">✕</button>
                    </div>
                    <label class="modal-label" for="new-group-name">Nom du groupe</label>
                    <input type="text" id="new-group-name" class="modal-input" placeholder="Ex. Les potes du dimanche" autocomplete="off">
                    <div class="modal-label" style="margin-top:16px">Ajouter des amis</div>
                    <div class="modal-friend-list">
                        ${FRIENDS.map((f) => `
                            <div class="modal-friend-row" data-friend-id="${f.id}">
                                <span class="friend-avatar" style="width:30px;height:30px;font-size:11px;background:${f.color}${f.textColor ? `;color:${f.textColor}` : ""}">${f.avatarUrl ? `<img src="${f.avatarUrl}" alt="" class="w-full h-full rounded-full object-cover">` : f.initials}</span>
                                <span class="modal-friend-name">${f.name}</span>
                                <input type="checkbox" class="modal-friend-checkbox">
                            </div>
                        `).join("")}
                    </div>
                    <p class="modal-error" id="modal-error" hidden>Sélectionne au moins 2 amis pour créer un groupe.</p>
                    <div class="modal-footer">
                        <button type="button" class="button button-secondary" id="modal-cancel-btn">Annuler</button>
                        <button type="button" class="button button-primary" id="modal-create-btn" disabled>Créer le groupe</button>
                    </div>
                </div>
            </div>
        `;

        const overlay = modalRoot.querySelector<HTMLElement>(".modal-overlay");
        const nameInput = modalRoot.querySelector<HTMLInputElement>("#new-group-name");
        const createBtn = modalRoot.querySelector<HTMLButtonElement>("#modal-create-btn");
        const errorEl = modalRoot.querySelector<HTMLElement>("#modal-error");

        function refreshCreateState() {
            if (createBtn) createBtn.disabled = !nameInput?.value.trim();
        }

        function hideError() {
            if (errorEl) errorEl.hidden = true;
        }

        overlay?.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        modalRoot.querySelector(".modal-close")?.addEventListener("click", closeModal);
        modalRoot.querySelector("#modal-cancel-btn")?.addEventListener("click", closeModal);
        nameInput?.addEventListener("input", refreshCreateState);

        modalRoot.querySelectorAll<HTMLElement>(".modal-friend-row").forEach((row) => {
            const friendId = row.dataset.friendId!;
            const checkbox = row.querySelector<HTMLInputElement>(".modal-friend-checkbox")!;
            row.addEventListener("click", (e) => {
                if (e.target === checkbox) return;
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event("change"));
            });
            checkbox.addEventListener("change", () => {
                row.classList.toggle("is-picked", checkbox.checked);
                if (checkbox.checked) pickedIds.add(friendId);
                else pickedIds.delete(friendId);
                hideError();
            });
        });

        createBtn?.addEventListener("click", () => {
            const name = nameInput?.value.trim();
            if (!name) return;

            if (pickedIds.size < 2) {
                if (errorEl) errorEl.hidden = false;
                return;
            }

            const existingIds = new Set(GROUPS.map((g) => g.id));
            let id = slugify(name);
            while (existingIds.has(id)) id += "-2";

            GROUPS.push({id, label: name});
            pickedIds.forEach((friendId) => {
                const friend = FRIENDS.find((f) => f.id === friendId);
                if (friend && !friend.groupIds.includes(id)) friend.groupIds.push(id);
            });

            closeModal();
            selectGroup(id);
        });

        nameInput?.focus();
    }

    function openAddFriendModal() {
        if (!modalRoot) return;

        modalRoot.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-panel">
                    <div class="modal-header">
                        <span>Ajouter un ami</span>
                        <button type="button" class="modal-close" aria-label="Fermer">✕</button>
                    </div>
                    <p class="modal-message" style="margin-bottom:16px">Entre l'ID Discord de la personne — la demande part directement, il n'y a pas d'aperçu de profil possible.</p>
                    <div class="modal-label">ID Discord</div>
                    <input type="text" id="discord-id-input" class="modal-input" placeholder="Ex. 841273920475193" autocomplete="off" inputmode="numeric">
                    <p class="modal-error" id="modal-error" hidden></p>
                    <div class="modal-footer">
                        <button type="button" class="button button-secondary" id="modal-cancel-btn">Annuler</button>
                        <button type="button" class="button button-primary" id="modal-send-request-btn">Envoyer la demande</button>
                    </div>
                </div>
            </div>
        `;

        const overlay = modalRoot.querySelector<HTMLElement>(".modal-overlay");
        const idInput = modalRoot.querySelector<HTMLInputElement>("#discord-id-input");
        const sendRequestBtn = modalRoot.querySelector<HTMLButtonElement>("#modal-send-request-btn");
        const errorEl = modalRoot.querySelector<HTMLElement>("#modal-error");

        overlay?.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        modalRoot.querySelector(".modal-close")?.addEventListener("click", closeModal);
        modalRoot.querySelector("#modal-cancel-btn")?.addEventListener("click", closeModal);

        sendRequestBtn?.addEventListener("click", async () => {
            const discordId = idInput?.value.trim();
            if (!discordId) return;

            sendRequestBtn.disabled = true;
            if (errorEl) errorEl.hidden = true;

            try {
                await apiRequest(`/friends/send-to/${discordId}`, {method: "POST"});
                closeModal();
            } catch (err) {
                if (errorEl) {
                    errorEl.hidden = false;
                    errorEl.textContent = err instanceof ApiError ? err.message : "Erreur inattendue.";
                }
            } finally {
                sendRequestBtn.disabled = false;
            }
        });

        idInput?.focus();
    }

    // Les events de présence peuvent arriver avant que loadFriends() (réseau)
    // n'ait fini : on les garde ici, indépendamment de FRIENDS, et on les
    // réapplique à chaque (re)chargement de la liste.
    const onlineIds = new Set<string>();
    const dndIds = new Set<string>();

    // Même logique de filtrage que demandes.ts : l'API ne pré-filtre pas les
    // demandes refusées côté "received".
    async function updateRequestsBadge() {
        if (!requestsNavLink) return;
        try {
            const data = await apiRequest<{ received: { isRejected?: boolean | null }[] }>("/friends/requests");
            const count = data.received.filter((r) => !(r.isRejected ?? (r as unknown as { is_rejected?: boolean }).is_rejected)).length;
            requestsNavLink.dataset.count = String(count);
        } catch (err) {
            console.error("Impossible de charger le nombre de demandes :", err);
        }
    }

    async function loadFriends() {
        try {
            const remote = await fetchFriends();
            FRIENDS = remote.map((f) => ({
                id: f.discordId,
                discordId: f.discordId,
                name: f.name,
                initials: f.initials,
                color: f.color,
                textColor: f.textColor,
                avatarUrl: f.avatarUrl,
                online: onlineIds.has(f.discordId),
                muted: isMuted(f.discordId),
                dnd: dndIds.has(f.discordId),
                groupIds: [],
            }));
        } catch (err) {
            console.error("Impossible de charger les amis :", err);
        }
        renderGroupPills();
        renderFriendList();
        updateSelectionBar();
        // Redemande un snapshot frais maintenant que la liste est là : ne dépend
        // plus du timing exact du snapshot auto-envoyé à la connexion du socket.
        requestFriendsOnline();
    }

    // connectSocket() est ré-entrant : peu importe si main.ts l'a déjà appelé.
    void connectSocket().then(() => {
        onSocket("friends_online", (ids: string[]) => {
            ids.forEach((id) => onlineIds.add(id));
            let changed = false;
            FRIENDS.forEach((f) => {
                if (onlineIds.has(f.discordId) && !f.online) {
                    f.online = true;
                    changed = true;
                }
            });
            if (changed) renderFriendList();
        });

        onSocket("friend_online", (payload: FriendPresencePayload) => {
            onlineIds.add(payload.user_id);
            const friend = FRIENDS.find((f) => f.discordId === payload.user_id);
            if (friend) {
                friend.online = true;
                renderFriendList();
            }
        });

        onSocket("friend_offline", (payload: FriendPresencePayload) => {
            onlineIds.delete(payload.user_id);
            dndIds.delete(payload.user_id);
            const friend = FRIENDS.find((f) => f.discordId === payload.user_id);
            if (friend) {
                friend.online = false;
                friend.dnd = false;
                renderFriendList();
            }
        });

        onSocket("dnd_online", (ids: string[]) => {
            ids.forEach((id) => dndIds.add(id));
            let changed = false;
            FRIENDS.forEach((f) => {
                if (dndIds.has(f.discordId) && !f.dnd) {
                    f.dnd = true;
                    changed = true;
                }
            });
            if (changed) renderFriendList();
        });

        onSocket("friend_dnd", (payload: FriendDndPayload) => {
            if (payload.dnd) dndIds.add(payload.user_id);
            else dndIds.delete(payload.user_id);
            const friend = FRIENDS.find((f) => f.discordId === payload.user_id);
            if (friend) {
                friend.dnd = payload.dnd;
                renderFriendList();
            }
        });

        onSocket("friend_removed", (payload: FriendRemovedPayload) => {
            FRIENDS = FRIENDS.filter((f) => f.discordId !== payload.user_id);
            renderGroupPills();
            renderFriendList();
            updateSelectionBar();
        });

        // Nouvelle demande reçue, ou une des nôtres acceptée/refusée : le badge
        // "Demandes" doit refléter le compte à jour sans attendre un rechargement.
        onSocket("friend_request", () => void updateRequestsBadge());
        onSocket("friend_request_edit", () => void updateRequestsBadge());
    }).catch((err) => console.error("Connexion socket impossible :", err));

    searchInput?.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderFriendList();
    });

    sendBtn?.addEventListener("click", () => {
        const targets = FRIENDS.filter((f) => selectedIds.has(f.id));
        if (!targets.length) return;

        const activeGroup = GROUPS.find((g) => g.id === activeGroupId);
        setSendContext({
            recipients: targets.map((f) => ({
                id: f.id,
                name: f.name,
                initials: f.initials,
                color: f.color,
                textColor: f.textColor,
                avatarUrl: f.avatarUrl,
            })),
            groupLabel: activeGroup?.label ?? null,
        });

        window.location.href = "./envoyer.html";
    });

    addGroupBtn?.addEventListener("click", openCreateGroupModal);
    addFriendBtn?.addEventListener("click", openAddFriendModal);

    renderGroupPills();
    renderFriendList();
    updateSelectionBar();
    void loadFriends();
    void updateRequestsBadge();
}
