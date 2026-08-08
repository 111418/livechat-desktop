interface Friend {
    id: string;
    name: string;
    initials: string;
    color: string;
    textColor?: string;
    online: boolean;
    muted: boolean;
    groupIds: string[];
}

interface Group {
    id: string;
    label: string;
}

const GROUPS: Group[] = [
    {id: "potes", label: "Les potes"},
    {id: "stream", label: "Stream squad"},
];

const FRIENDS: Friend[] = [
    {id: "nour", name: "Nour", initials: "NR", color: "#5865F2", online: true, muted: false, groupIds: ["potes"]},
    {id: "theo", name: "Théo", initials: "TH", color: "#ED6A5E", online: true, muted: true, groupIds: ["potes"]},
    {id: "maya", name: "Maya", initials: "MA", color: "#F4BD50", textColor: "#3a2a00", online: true, muted: false, groupIds: ["potes", "stream"]},
    {id: "sami", name: "Sami", initials: "SA", color: "#3a3b40", online: false, muted: false, groupIds: []},
    {id: "lea", name: "Léa", initials: "LE", color: "#3a3b40", online: false, muted: false, groupIds: ["stream"]},
];

export function initAccueil() {
    const groupPillsEl = document.querySelector<HTMLElement>("#group-pills");
    const friendListEl = document.querySelector<HTMLElement>("#friend-list");
    const searchInput = document.querySelector<HTMLInputElement>("#friend-search");
    const countText = document.querySelector<HTMLElement>("#friend-count-text");
    const selectionBar = document.querySelector<HTMLElement>("#selection-bar");
    const selectionCount = selectionBar?.querySelector(".selection-count");
    const selectionGroupName = document.querySelector<HTMLElement>("#selection-group-name");
    const sendBtn = document.querySelector<HTMLButtonElement>("#send-jumpscare-btn");

    if (!groupPillsEl || !friendListEl) return;

    let activeGroupId = GROUPS[0]?.id ?? "";
    let searchQuery = "";
    const selectedIds = new Set<string>(
        FRIENDS.filter((f) => f.online && f.groupIds.includes(activeGroupId)).map((f) => f.id)
    );

    function groupMemberCount(groupId: string): number {
        return FRIENDS.filter((f) => f.groupIds.includes(groupId)).length;
    }

    function renderGroupPills() {
        groupPillsEl!.innerHTML = GROUPS.map((group) => `
            <button type="button" class="button ${group.id === activeGroupId ? "button-pill-active" : "button-pill"} text-sm flex items-center" data-group-id="${group.id}">
                ${group.label} · ${groupMemberCount(group.id)}
            </button>
        `).join("");

        groupPillsEl!.querySelectorAll<HTMLButtonElement>("button[data-group-id]").forEach((btn) => {
            btn.addEventListener("click", () => selectGroup(btn.dataset.groupId!));
        });
    }

    function renderFriendItem(friend: Friend): string {
        const selected = selectedIds.has(friend.id);
        const avatarStyle = `background:${friend.color}${friend.textColor ? `;color:${friend.textColor}` : ""}`;

        if (!friend.online) {
            return `
                <div class="friend-item friend-item-offline" data-friend-id="${friend.id}">
                    <div class="friend-avatar" style="${avatarStyle}">
                        ${friend.initials}
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
            ? `<span class="friend-status-text-muted"><img src="./assets/svg/icons/bell-off.svg" alt="" class="w-2.5 h-2.5">Muté · ne te réveillera pas</span>`
            : `<span class="friend-status-text">App ouverte</span>`;

        return `
            <div class="friend-item friend-item-online${selected ? "" : " is-deselected"}" data-friend-id="${friend.id}" data-selected="${selected}" data-muted="${friend.muted}">
                <div class="friend-avatar" style="${avatarStyle}">
                    ${friend.initials}
                    <span class="friend-status-dot"></span>
                </div>
                <div class="friend-name-col">
                    <span class="friend-name">${friend.name}</span>
                    ${statusHtml}
                </div>
                <div class="friend-actions">
                    <button type="button" class="mute-btn${friend.muted ? " mute-btn-active" : ""}" title="${friend.muted ? "Réactiver les jumpscares" : "Muter — bloque ses jumpscares"}">
                        <img src="./assets/svg/icons/bell${friend.muted ? "-off" : ""}.svg" alt="">
                    </button>
                    <button type="button" class="select-check${selected ? "" : " is-empty"}">
                        <img src="./assets/svg/icons/check.svg" alt="">
                    </button>
                </div>
            </div>
        `;
    }

    function renderFriendList() {
        const query = searchQuery.trim().toLowerCase();
        const visible = FRIENDS.filter((f) => f.name.toLowerCase().includes(query));
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
            html = `<div class="friend-empty-state">Aucun ami ne correspond à « ${searchQuery} »</div>`;
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

        const openCount = FRIENDS.filter((f) => f.online).length;
        if (countText) countText.textContent = `${openCount} ouvertes · ${FRIENDS.length} amis`;
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
        renderFriendList();
    }

    function selectGroup(groupId: string) {
        activeGroupId = groupId;
        selectedIds.clear();
        FRIENDS.filter((f) => f.online && f.groupIds.includes(groupId)).forEach((f) => selectedIds.add(f.id));
        renderGroupPills();
        renderFriendList();
        updateSelectionBar();
    }

    function updateSelectionBar() {
        const count = selectedIds.size;
        if (selectionCount) selectionCount.textContent = String(count);
        const activeGroup = GROUPS.find((g) => g.id === activeGroupId);
        if (selectionGroupName) selectionGroupName.textContent = activeGroup?.label ?? "";
        selectionBar?.classList.toggle("is-visible", count > 0);
    }

    searchInput?.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderFriendList();
    });

    sendBtn?.addEventListener("click", () => {
        const targets = FRIENDS.filter((f) => selectedIds.has(f.id));
        console.log("Envoi d'un jumpscare à", targets.map((f) => f.name));
    });

    renderGroupPills();
    renderFriendList();
    updateSelectionBar();
}
