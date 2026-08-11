import { apiRequest } from "./api.ts";

export interface Me {
    discord_id: string;
    username: string | null;
}

export function fetchMe(): Promise<Me> {
    return apiRequest<Me>("/auth/me");
}
