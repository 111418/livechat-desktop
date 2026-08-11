import { apiRequest } from "./api.ts";
import { getMyDiscordId } from "./config.ts";
import { avatarUrl, colorFromId, initials } from "../utils/avatar.ts";

interface FriendRow {
    user1_id: string;
    user2_id: string;
    user1_username: string;
    user2_username: string;
    user1_avatar_hash: string | null;
    user2_avatar_hash: string | null;
}

export interface RemoteFriend {
    discordId: string;
    name: string;
    initials: string;
    color: string;
    textColor?: string;
    avatarUrl: string | null;
    // Pas de snapshot de présence côté API : on démarre hors-ligne, mis à jour par le socket.
    online: boolean;
}

export async function fetchFriends(): Promise<RemoteFriend[]> {
    const rows = await apiRequest<FriendRow[]>("/friends/");
    const myId = await getMyDiscordId();

    return rows.map((row) => {
        const isUser1 = row.user1_id === myId;
        const discordId = isUser1 ? row.user2_id : row.user1_id;
        const name = isUser1 ? row.user2_username : row.user1_username;
        const avatarHash = isUser1 ? row.user2_avatar_hash : row.user1_avatar_hash;
        const { color, textColor } = colorFromId(discordId);

        return {
            discordId,
            name,
            initials: initials(name),
            color,
            textColor,
            avatarUrl: avatarUrl(discordId, avatarHash),
            online: false,
        };
    });
}
