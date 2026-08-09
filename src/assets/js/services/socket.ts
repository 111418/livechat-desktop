import { io, type Socket } from "socket.io-client";
import { getServerUrl, getToken } from "./config.ts";

const SOCKET_PORT = 3330;

export interface LivechatMessage {
    url: string;
    message?: string;
    transparent?: boolean;
    duration?: number;
    author_discord_id: string;
    author_name: string;
}

export interface PresenceEntry {
    user_id: string;
    username: string;
}

interface SocketEventMap {
    friends_online: PresenceEntry[];
    friend_online: PresenceEntry;
    friend_offline: PresenceEntry;
    friend_removed: { user_id: string };
    friend_request: { sender_id: string; sender_username: string };
    friend_request_edit: { sender_id: string; is_accepted?: true; is_rejected?: true };
    livechat: LivechatMessage;
    disconnect: void;
}

let socketPromise: Promise<Socket> | null = null;

function ensureSocket(): Promise<Socket> {
    if (!socketPromise) {
        socketPromise = (async () => {
            const serverUrl = await getServerUrl();
            const token = await getToken();
            if (!serverUrl || !token) throw new Error("Pas de session active.");

            const parsed = new URL(serverUrl);
            const wsUrl = `${parsed.protocol}//${parsed.hostname}:${SOCKET_PORT}`;
            const socket = io(wsUrl);

            socket.on("connect", () => socket.emit("authenticate", token));

            return socket;
        })();
    }
    return socketPromise;
}

// Ouvre la connexion (idempotent) — à appeler une fois au chargement des pages
// authentifiées, avant de s'abonner aux events avec onSocket.
export function connectSocket(): Promise<Socket> {
    return ensureSocket();
}

export function onSocket<K extends keyof SocketEventMap>(
    event: K,
    cb: (payload: SocketEventMap[K]) => void
): void {
    ensureSocket().then((socket) => socket.on(event as string, cb as (...args: any[]) => void));
}

export function offSocket<K extends keyof SocketEventMap>(
    event: K,
    cb: (payload: SocketEventMap[K]) => void
): void {
    ensureSocket().then((socket) => socket.off(event as string, cb as (...args: any[]) => void));
}
