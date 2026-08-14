import {initials} from "../utils/avatar.ts";
import {colorFromId} from "../utils/avatar.ts";
import {apiRequest} from "../services/api.ts";
import {connectSocket, onSocket, type FriendRequestPayload, type FriendRequestEditPayload} from "../services/socket.ts";

interface FriendRequestRow {
    senderId: string;
    receiverId: string;
    isAccepted: boolean | null;
    isPending: boolean | null;
    isRejected: boolean | null;
}

interface FriendRequestsResponse {
    sent: FriendRequestRow[];
    received: FriendRequestRow[];
}

interface RequestItem {
    id: string;
    name: string;
}

type Tab = "received" | "sent";

let received: RequestItem[] = [];
let sent: RequestItem[] = [];

// L'API ne renvoie pas de pseudo sur les demandes (juste sender_id/receiver_id) :
// on retombe sur l'id Discord tronqué, comme ailleurs dans l'app.
function fallbackName(discordId: string): string {
    return `Ami #${discordId.slice(-4)}`;
}

function isRejected(row: FriendRequestRow): boolean {
    return Boolean(row.isRejected ?? (row as unknown as { is_rejected?: boolean }).is_rejected);
}

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

    function renderAvatar(item: RequestItem): string {
        const {color, textColor} = colorFromId(item.id);
        const style = `background:${color}${textColor ? `;color:${textColor}` : ""}`;
        return `<div class="request-avatar" style="${style}">${initials(item.name)}</div>`;
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
                        </div>
                        <div class="request-actions">
                            <button type="button" class="accept-btn" data-accept="${r.id}">
                                <img src="/assets/svg/icons/check.svg" alt="">
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
                        </div>
                        <span class="pending-badge">
                            <img src="/assets/svg/icons/clock.svg" alt="">
                            En attente
                        </span>
                        <button type="button" class="cancel-btn" data-cancel="${r.id}">Annuler</button>
                    </div>
                `).join("")}
            `;

            listEl!.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((btn) => {
                btn.addEventListener("click", () => cancelRequest());
            });
        }
    }

    async function respondToRequest(id: string, action: "accept" | "reject") {
        try {
            if (action === "accept") {
                await apiRequest(`/friends/accept/${id}`, {method: "POST"});
            } else {
                await apiRequest(`/friends/reject/${id}`, {method: "PATCH"});
            }
            received = received.filter((r) => r.id !== id);
            renderTabs();
            renderList();
        } catch (err) {
            console.error(`Impossible de ${action === "accept" ? "accepter" : "refuser"} la demande :`, err);
        }
    }

    // L'API n'expose aucune route pour annuler une demande envoyée — on
    // prévient plutôt que de simuler un succès qui n'existe pas côté serveur.
    function cancelRequest() {
        alert("Impossible d'annuler une demande envoyée pour l'instant : cette action n'existe pas côté serveur.");
    }

    async function loadRequests() {
        try {
            const data = await apiRequest<FriendRequestsResponse>("/friends/requests");
            received = data.received
                .filter((r) => !isRejected(r))
                .map((r) => ({id: r.senderId, name: fallbackName(r.senderId)}));
            sent = data.sent.map((r) => ({id: r.receiverId, name: fallbackName(r.receiverId)}));
        } catch (err) {
            console.error("Impossible de charger les demandes :", err);
        }
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

    // connectSocket() est ré-entrant : peu importe si main.ts l'a déjà appelé.
    void connectSocket().then(() => {
        onSocket("friend_request", (payload: FriendRequestPayload) => {
            if (received.some((r) => r.id === payload.sender_id)) return;
            received = [...received, {id: payload.sender_id, name: payload.sender_username}];
            renderTabs();
            renderList();
        });

        // Le payload ne dit pas QUELLE demande envoyée a changé (juste que
        // l'une d'elles a bougé) — on recharge la liste plutôt que de deviner.
        onSocket("friend_request_edit", (_payload: FriendRequestEditPayload) => {
            void loadRequests();
        });
    }).catch((err) => console.error("Connexion socket impossible :", err));

    renderTabs();
    renderList();
    void loadRequests();
}

initDemandes();
