import {LazyStore} from "@tauri-apps/plugin-store";

// localStorage ne survit pas de façon fiable à un redémarrage complet du
// process (contrairement à tauri-plugin-store, déjà utilisé pour le token/
// l'URL serveur) : les groupes doivent passer par le même mécanisme pour
// vraiment persister d'une session à l'autre.
const store = new LazyStore("groups.json");

export interface StoredGroup {
    id: string;
    label: string;
}

export interface GroupsData {
    groups: StoredGroup[];
    // discordId -> groupIds. N'inclut que les amis qui appartiennent à au moins un groupe.
    membership: Record<string, string[]>;
}

export async function loadPersistedGroupsData(): Promise<GroupsData> {
    const data = await store.get<GroupsData>("data");
    return {groups: data?.groups ?? [], membership: data?.membership ?? {}};
}

export async function saveGroupsData(data: GroupsData): Promise<void> {
    await store.set("data", data);
    await store.save();
}

// Sauvegarde tout d'un coup (groupes + appartenance) : plus simple et plus
// sûr que des mutations partielles, vu la fréquence à laquelle ça change peu.
export async function persistGroups(groups: StoredGroup[], friends: {discordId: string; groupIds: string[]}[]): Promise<void> {
    const membership: Record<string, string[]> = {};
    for (const f of friends) {
        if (f.groupIds.length) membership[f.discordId] = f.groupIds;
    }
    await saveGroupsData({groups, membership});
}
