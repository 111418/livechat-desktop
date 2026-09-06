import { LazyStore } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

const store = new LazyStore("config.json");

export interface MonitorInfo {
    name: string;
    width: number;
    height: number;
    isPrimary: boolean;
}

export async function listMonitors(): Promise<MonitorInfo[]> {
    return await invoke<MonitorInfo[]>("list_monitors");
}

// Nom du moniteur (voir MonitorInfo.name, ex. "\\.\DISPLAY2") ou null pour
// suivre l'ecran principal actuel (comportement par defaut). Lu cote Rust
// (voir apply_overlay_monitor dans lib.rs) pour positionner la fenetre overlay.
export async function getOverlayMonitor(): Promise<string | null> {
    return (await store.get<string>("overlayMonitor")) ?? null;
}

export async function setOverlayMonitor(name: string | null): Promise<void> {
    if (name) await store.set("overlayMonitor", name);
    else await store.delete("overlayMonitor");
    await store.save();
}

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

// Pourcentage de zoom appliqué à toute l'UI (voir main.ts) : beaucoup de
// tailles dans ce projet sont en px fixe plutôt qu'en rem, donc un simple
// changement du font-size racine n'affecterait pas grand-chose — le zoom
// CSS (natif WebView2/Chromium) met tout à l'échelle uniformément.
export async function getTextScale(): Promise<number> {
    return (await store.get<number>("textScale")) ?? 100;
}

export async function setTextScale(value: number): Promise<void> {
    await store.set("textScale", value);
    await store.save();
}

// Le serveur renvoie aussi à l'expéditeur son propre jumpscare (voir
// livechat-api) : ce réglage décide si on l'affiche chez soi ou si on
// l'ignore (défaut, comme avant).
export async function getSelfPreview(): Promise<boolean> {
    return (await store.get<boolean>("selfPreview")) ?? false;
}

export async function setSelfPreview(value: boolean): Promise<void> {
    await store.set("selfPreview", value);
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
