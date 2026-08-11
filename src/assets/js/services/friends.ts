import { apiRequest } from "./api.ts";
import { getMyDiscordId } from "./config.ts";
import { colorFromId, initials } from "../utils/avatar.ts";

interface FriendRow {
    user1_id: string;
    user2_id: string;
    user1_username: string;
    user2_username: string;
}

export interface RemoteFriend {
    discordId: string;
    name: string;
    initials: string;
    color: string;
    textColor?: string;
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
        const { color, textColor } = colorFromId(discordId);

        return {
            discordId,
            name,
            initials: initials(name),
            color,
            textColor,
            online: false,
        };
    });
}
