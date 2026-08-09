import { load, type Store } from "@tauri-apps/plugin-store";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
    if (!storePromise) storePromise = load("config.json");
    return storePromise;
}

export async function getServerUrl(): Promise<string | null> {
    const store = await getStore();
    return (await store.get<string>("serverUrl")) ?? null;
}

export async function setServerUrl(url: string): Promise<void> {
    const store = await getStore();
    await store.set("serverUrl", url);
    await store.save();
}

export async function getToken(): Promise<string | null> {
    const store = await getStore();
    return (await store.get<string>("token")) ?? null;
}

export async function setToken(token: string): Promise<void> {
    const store = await getStore();
    await store.set("token", token);
    await store.save();
}

export async function clearToken(): Promise<void> {
    const store = await getStore();
    await store.delete("token");
    await store.save();
}

// Décode la partie payload d'un JWT (pas de vérification de signature — le
// serveur a déjà validé le token, on lit juste { discord_id } côté client).
export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
    try {
        const payload = token.split(".")[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(json) as T;
    } catch {
        return null;
    }
}

export async function getMyDiscordId(): Promise<string | null> {
    const token = await getToken();
    if (!token) return null;
    const payload = decodeJwt<{ discord_id: string }>(token);
    return payload?.discord_id ?? null;
}
