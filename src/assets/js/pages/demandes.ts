import { initials, colorFromId } from "../utils/avatar.ts";
import { apiRequest } from "../services/api.ts";
import { onSocket } from "../services/socket.ts";

// L'API ne documente pas de champ username sur FriendRequest (seulement
// sender_id/receiver_id) — on tente sender_username/receiver_username si le
// serveur les fournit (comme pour /friends), sinon on affiche l'id brut.
interface ApiFriendRequest {
    sender_id: string;
    receiver_id: string;
    sender_username?: string | null;
    receiver_username?: string | null;
    is_rejected?: boolean;
    isRejected?: boolean;
}

interface FriendRequest {
    id: string; // discord id de l'autre utilisateur
    name: string;
}

type Tab = "received" | "sent";

function toDisplay(id: string, username?: string | null): FriendRequest {
    return { id, name: username || id };
}

export function initDemandes() {
    const tabsEl = document.querySelector<HTMLElement>("#demandes-tabs");
    const listEl = document.querySelector<HTMLElement>("#demandes-list");
    const receivedCountEl = document.querySelector<HTMLElement>("#received-count");
    const sentCountEl = document.querySelector<HTMLElement>("#sent-count");

    if (!tabsEl || !listEl) return;

    let activeTab: Tab = "received";
    let received: FriendRequest[] = [];
    let sent: FriendRequest[] = [];

    function renderTabs() {
        if (receivedCountEl) receivedCountEl.textContent = String(received.length);
        if (sentCountEl) sentCountEl.textContent = String(sent.length);

        tabsEl!.querySelectorAll<HTMLButtonElement>(".demandes-tab").forEach((tab) => {
            tab.classList.toggle("is-active", tab.dataset.tab === activeTab);
        });
    }

    function renderAvatar(request: FriendRequest): string {
        const { color, textColor } = colorFromId(request.id);
        const style = `background:${color}${textColor ? `;color:${textColor}` : ""}`;
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

    async function respondToRequest(id: string, action: "accept" | "reject") {
        try {
            if (action === "accept") {
                await apiRequest(`/friends/accept/${id}`, { method: "POST" });
            } else {
                await apiRequest(`/friends/reject/${id}`, { method: "PATCH" });
            }
            received = received.filter((r) => r.id !== id);
            renderTabs();
            renderList();
        } catch (err) {
            window.alert(err instanceof Error ? err.message : "Erreur lors de la réponse à la demande.");
        }
    }

    // Pas d'endpoint documenté pour annuler une demande envoyée — on le signale
    // plutôt que de simuler un succès qui n'existe pas côté serveur.
    function cancelRequest(_id: string) {
        window.alert("Annuler une demande envoyée n'est pas encore possible : l'API ne fournit pas cette route.");
    }

    tabsEl.querySelectorAll<HTMLButtonElement>(".demandes-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            activeTab = tab.dataset.tab as Tab;
            renderTabs();
            renderList();
        });
    });

    onSocket("friend_request", (payload) => {
        received.push(toDisplay(payload.sender_id, payload.sender_username));
        renderTabs();
        renderList();
    });

    onSocket("friend_request_edit", (payload) => {
        sent = sent.filter((r) => r.id !== payload.sender_id || !(payload.is_accepted || payload.is_rejected));
        renderTabs();
        renderList();
    });

    renderTabs();
    renderList();

    apiRequest<{ sent: ApiFriendRequest[]; received: ApiFriendRequest[] }>("/friends/requests")
        .then((data) => {
            received = data.received
                .filter((r) => !(r.isRejected ?? r.is_rejected))
                .map((r) => toDisplay(r.sender_id, r.sender_username));
            sent = data.sent.map((r) => toDisplay(r.receiver_id, r.receiver_username));
            renderTabs();
            renderList();
        })
        .catch((err) => {
            listEl!.innerHTML = `<div class="demandes-empty-state">Impossible de charger les demandes : ${err instanceof Error ? err.message : "erreur inconnue"}</div>`;
        });
}

initDemandes();
