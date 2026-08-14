import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("config.json");

export async function getServerUrl(): Promise<string> {
    return (await store.get<string>("serverUrl")) ?? "";
}

export async function setServerUrl(url: string): Promise<void> {
    await store.set("serverUrl", url.replace(/\/+$/, ""));
    await store.save();
}

// Lu côté Rust (voir lib.rs) au moment de fermer la fenêtre principale : true
// (défaut) = la croix masque juste la fenêtre, l'appli reste active en fond.
export async function getCloseToTray(): Promise<boolean> {
    return (await store.get<boolean>("closeToTray")) ?? true;
}

export async function setCloseToTray(value: boolean): Promise<void> {
    await store.set("closeToTray", value);
    await store.save();
}

export async function getToken(): Promise<string | null> {
    return (await store.get<string>("token")) ?? null;
}

export async function setToken(token: string): Promise<void> {
    await store.set("token", token);
    await store.save();
}

export async function clearToken(): Promise<void> {
    await store.delete("token");
    await store.save();
}

// Decode le payload d'un JWT sans verifier la signature (verification faite serveur-side).
export function decodeJwt<T>(token: string): T | null {
    try {
        const payloadB64 = token.split(".")[1];
        const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
        const json = new TextDecoder().decode(
            Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        );
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
