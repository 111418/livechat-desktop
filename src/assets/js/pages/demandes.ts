import { initials } from "../utils/avatar.ts";

interface FriendRequest {
    id: string;
    name: string;
    handle: string;
    tag: string;
    avatarColor: string;
    avatarTextColor?: string;
}

type Tab = "received" | "sent";

let received: FriendRequest[] = [
    {id: "lola", name: "Lola", handle: "lola", tag: "2207", avatarColor: "#1DA1F2"},
    {id: "yanis", name: "Yanis", handle: "yanis", tag: "8830", avatarColor: "#3BA55D"},
];

let sent: FriendRequest[] = [
    {id: "rayan", name: "Rayan", handle: "rayan", tag: "5512", avatarColor: "#F4BD50", avatarTextColor: "#3a2a00"},
];

export function initDemandes() {
    const tabsEl = document.querySelector<HTMLElement>("#demandes-tabs");
    const listEl = document.querySelector<HTMLElement>("#demandes-list");
    const receivedCountEl = document.querySelector<HTMLElement>("#received-count");
    const sentCountEl = document.querySelector<HTMLElement>("#sent-count");

    if (!tabsEl || !listEl) return;

    let activeTab: Tab = "received";

    function renderTabs() {
        if (receivedCountEl) receivedCountEl.textContent = String(received.length);
        if (sentCountEl) sentCountEl.textContent = String(sent.length);

        tabsEl!.querySelectorAll<HTMLButtonElement>(".demandes-tab").forEach((tab) => {
            tab.classList.toggle("is-active", tab.dataset.tab === activeTab);
        });
    }

    function renderAvatar(request: FriendRequest): string {
        const style = `background:${request.avatarColor}${request.avatarTextColor ? `;color:${request.avatarTextColor}` : ""}`;
        return `<div class="request-avatar" style="${style}">${initials(request.name)}</div>`;
    }

    function renderList() {
        if (activeTab === "received") {
            if (!received.length) {
                listEl!.innerHTML = `<div class="demandes-empty-state">Aucune demande reçue pour le moment.</div>`;
                return;
            }
            listEl!.innerHTML = `
                <div class="demandes-group-label">Reçues — ${received.length}</div>
                ${received.map((r) => `
                    <div class="request-card" data-request-id="${r.id}">
                        ${renderAvatar(r)}
                        <div class="request-name-col">
                            <span class="request-name">${r.name}</span>
                            <span class="request-handle">@${r.handle} · #${r.tag}</span>
                        </div>
                        <div class="request-actions">
                            <button type="button" class="accept-btn" data-accept="${r.id}">
                                <img src="./assets/svg/icons/check.svg" alt="">
                                Accepter
                            </button>
                            <button type="button" class="reject-btn" data-reject="${r.id}" title="Refuser">✕</button>
                        </div>
                    </div>
                `).join("")}
            `;

            listEl!.querySelectorAll<HTMLButtonElement>("[data-accept]").forEach((btn) => {
                btn.addEventListener("click", () => respondToRequest(btn.dataset.accept!, "accept"));
            });
            listEl!.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((btn) => {
                btn.addEventListener("click", () => respondToRequest(btn.dataset.reject!, "reject"));
            });
        } else {
            if (!sent.length) {
                listEl!.innerHTML = `<div class="demandes-empty-state">Aucune demande envoyée pour le moment.</div>`;
                return;
            }
            listEl!.innerHTML = `
                <div class="demandes-group-label">Envoyées — ${sent.length} en attente</div>
                ${sent.map((r) => `
                    <div class="request-card request-card-sent" data-request-id="${r.id}">
                        ${renderAvatar(r)}
                        <div class="request-name-col">
                            <span class="request-name">${r.name}</span>
                            <span class="request-handle">@${r.handle} · #${r.tag}</span>
                        </div>
                        <span class="pending-badge">
                            <img src="./assets/svg/icons/clock.svg" alt="">
                            En attente
                        </span>
                        <button type="button" class="cancel-btn" data-cancel="${r.id}">Annuler</button>
                    </div>
                `).join("")}
            `;

            listEl!.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((btn) => {
                btn.addEventListener("click", () => cancelRequest(btn.dataset.cancel!));
            });
        }
    }

    function respondToRequest(id: string, action: "accept" | "reject") {
        received = received.filter((r) => r.id !== id);
        console.log(action === "accept" ? "Demande acceptée :" : "Demande refusée :", id);
        renderTabs();
        renderList();
    }

    function cancelRequest(id: string) {
        sent = sent.filter((r) => r.id !== id);
        console.log("Demande annulée :", id);
        renderTabs();
        renderList();
    }

    tabsEl.querySelectorAll<HTMLButtonElement>(".demandes-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            activeTab = tab.dataset.tab as Tab;
            renderTabs();
            renderList();
        });
    });

    renderTabs();
    renderList();
}

initDemandes();
