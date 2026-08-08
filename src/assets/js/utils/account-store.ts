const STORAGE_KEY = "livechat:account";

export interface Account {
    username: string;
    tag: string;
}

const DEFAULT_ACCOUNT: Account = {
    username: "illyes",
    tag: "1418",
};

export function getAccount(): Account {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {...DEFAULT_ACCOUNT};
        return {...DEFAULT_ACCOUNT, ...JSON.parse(raw)};
    } catch {
        return {...DEFAULT_ACCOUNT};
    }
}

export function setUsername(username: string): void {
    const account = getAccount();
    account.username = username;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}
