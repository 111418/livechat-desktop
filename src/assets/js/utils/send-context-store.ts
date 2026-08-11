const STORAGE_KEY = "livechat:send-context";

export interface SendRecipient {
    id: string;
    name: string;
    initials: string;
    color: string;
    textColor?: string;
    avatarUrl?: string | null;
}

export interface SendContext {
    recipients: SendRecipient[];
    groupLabel: string | null;
}

export function setSendContext(context: SendContext): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

export function getSendContext(): SendContext | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as SendContext;
    } catch {
        return null;
    }
}

export function clearSendContext(): void {
    sessionStorage.removeItem(STORAGE_KEY);
}
