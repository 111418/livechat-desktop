const STORAGE_KEY = "livechat:muted-friends";

function readIds(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
}

function writeIds(ids: Set<string>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function isMuted(discordId: string): boolean {
    return readIds().has(discordId);
}

export function setMuted(discordId: string, muted: boolean): void {
    const ids = readIds();
    if (muted) ids.add(discordId);
    else ids.delete(discordId);
    writeIds(ids);
}
