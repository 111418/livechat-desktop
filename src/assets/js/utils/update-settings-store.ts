const STORAGE_KEY = "livechat:update-settings";

interface UpdateSettings {
    autoUpdate: boolean;
}

const DEFAULT_SETTINGS: UpdateSettings = {
    autoUpdate: false,
};

export function getUpdateSettings(): UpdateSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {...DEFAULT_SETTINGS};
        return {...DEFAULT_SETTINGS, ...JSON.parse(raw)};
    } catch {
        return {...DEFAULT_SETTINGS};
    }
}

export function setUpdateSettings(settings: UpdateSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
