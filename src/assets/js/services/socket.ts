import { io, type Socket } from "socket.io-client";
import { getServerUrl, getToken } from "./config.ts";

export interface LivechatPayload {
    url: string;
    message?: string | null;
    transparent?: boolean;
    author_discord_id: string;
    author_name: string;
    duration?: number;
}

// { user_id, username } de l'ami qui vient de se connecter/déconnecter.
export interface FriendPresencePayload {
    user_id: string;
    username: string;
}

export interface FriendRemovedPayload {
    user_id: string;
}

// { sender_username, sender_id }
export interface FriendRequestPayload {
    sender_username: string;
    sender_id: string;
}

// { sender_id, is_rejected? | is_accepted? }
export interface FriendRequestEditPayload {
    sender_id: string;
    is_rejected?: boolean;
    is_accepted?: boolean;
}

interface SocketEvents {
    // Snapshot envoyé juste après authenticate : ids Discord des amis déjà en ligne.
    friends_online: string[];
    friend_online: FriendPresencePayload;
    friend_offline: FriendPresencePayload;
    friend_removed: FriendRemovedPayload;
    friend_request: FriendRequestPayload;
    friend_request_edit: FriendRequestEditPayload;
    livechat: LivechatPayload;
}

let socket: Socket | null = null;
// Plusieurs pages (main.ts, accueil.ts, demandes.ts...) sont chargées comme des
// scripts indépendants et peuvent toutes appeler connectSocket() en même temps
// au chargement — ce cache évite de créer deux sockets en parallèle.
let connecting: Promise<Socket> | null = null;

export function connectSocket(): Promise<Socket> {
    if (socket) return Promise.resolve(socket);
    if (connecting) return connecting;

    connecting = (async () => {
        const serverUrl = await getServerUrl();
        const token = await getToken();
        if (!serverUrl || !token) throw new Error("Serveur ou token manquant pour la connexion socket.");

        const parsed = new URL(serverUrl);
        const wsUrl = `${parsed.protocol}//${parsed.hostname}:3330`;

        const newSocket = io(wsUrl, { transports: ["websocket"] });
        newSocket.on("connect", () => {
            newSocket.emit("authenticate", token);
        });

        socket = newSocket;
        return newSocket;
    })();

    return connecting.finally(() => {
        connecting = null;
    });
}

// Redemande un snapshot de présence frais (voir accueil.ts) : évite toute
// dépendance au timing exact du snapshot automatique envoyé après authenticate.
export function requestFriendsOnline(): void {
    socket?.emit("get_friends_online");
}

export function onSocket<E extends keyof SocketEvents>(
    event: E,
    cb: (payload: SocketEvents[E]) => void,
): void {
    (socket as Socket | null)?.on(event as string, cb as (...args: any[]) => void);
}

export function offSocket<E extends keyof SocketEvents>(
    event: E,
    cb: (payload: SocketEvents[E]) => void,
): void {
    (socket as Socket | null)?.off(event as string, cb as (...args: any[]) => void);
}
