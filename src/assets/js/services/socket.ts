import { io, type Socket } from "socket.io-client";
import { getServerUrl, getToken } from "./config.ts";

export interface LivechatPayload {
    url: string;
    message?: string | null;
    transparent?: boolean;
    author_discord_id: string;
    author_name: string;
    author_avatar_hash?: string | null;
    duration?: number;
    offset?: number;
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
        // En local, l'API dev lance le WebSocket sur un port séparé codé en
        // dur (3330). En prod, ce port n'est pas exposé publiquement : le
        // serveur passe par un reverse proxy qui route un chemin (/websocket)
        // sur le même domaine/port que l'API REST — voir ce que ton pote a
        // configuré avant de changer ce comportement.
        const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        const wsUrl = isLocal
            ? `${parsed.protocol}//${parsed.hostname}:3330`
            : `${parsed.protocol}//${parsed.host}`;

        const newSocket = io(wsUrl, {
            transports: ["websocket"],
            ...(isLocal ? {} : { path: "/websocket/socket.io/" }),
        });
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
