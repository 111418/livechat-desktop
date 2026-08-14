const STORAGE_KEY = "livechat:overlay-settings";

export type PositionId = "top-left" | "top-center" | "top-right" | "middle-left" | "center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface OverlaySettings {
    transparent: boolean;
    position: PositionId;
    volume: number;
}

const DEFAULT_SETTINGS: OverlaySettings = {
    // Plein écran = opt-in, pas opt-out : sinon un envoi sans y penser prend
    // tout l'écran du destinataire par défaut.
    transparent: false,
    position: "top-right",
    volume: 80,
};

export function getOverlaySettings(): OverlaySettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {...DEFAULT_SETTINGS};
        return {...DEFAULT_SETTINGS, ...JSON.parse(raw)};
    } catch {
        return {...DEFAULT_SETTINGS};
    }
}

export function setOverlaySettings(settings: OverlaySettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
