import { apiRequest } from "./api.ts";
import { getMyDiscordId } from "./config.ts";
import { initials, colorFromId } from "../utils/avatar.ts";

export interface FriendSummary {
    id: string; // discord id de l'ami
    name: string;
    initials: string;
    color: string;
    textColor?: string;
}

interface ApiFriend {
    user1_id: string;
    user2_id: string;
    user1_username: string | null;
    user2_username: string | null;
}

export async function fetchFriends(): Promise<FriendSummary[]> {
    const myId = await getMyDiscordId();
    if (!myId) return [];

    const raw = await apiRequest<ApiFriend[]>("/friends/");
    return raw.map((f) => {
        const isUser1Me = f.user1_id === myId;
        const friendId = isUser1Me ? f.user2_id : f.user1_id;
        const friendUsername = (isUser1Me ? f.user2_username : f.user1_username) || friendId;
        const { color, textColor } = colorFromId(friendId);
        return { id: friendId, name: friendUsername, initials: initials(friendUsername), color, textColor };
    });
}
