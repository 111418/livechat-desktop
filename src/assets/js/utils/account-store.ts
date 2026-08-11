const STORAGE_KEY = "livechat:account";

export interface Account {
    username: string;
    discordId: string;
}

const DEFAULT_ACCOUNT: Account = {
    username: "",
    discordId: "",
};

export function getAccount(): Account {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_ACCOUNT };
        return { ...DEFAULT_ACCOUNT, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_ACCOUNT };
    }
}

export function setAccount(account: Account): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

export function setUsername(username: string): void {
    const account = getAccount();
    account.username = username;
    setAccount(account);
}

export function clearAccount(): void {
    localStorage.removeItem(STORAGE_KEY);
}
