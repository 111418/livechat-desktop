export function initials(username : string): string{
    return username.slice(0, 2).toUpperCase();
}

// Le backend ne fournit ni avatar ni couleur par utilisateur (cf. doc API §9) —
// on dérive une couleur stable à partir de son id Discord.
const AVATAR_PALETTE: {color: string; textColor?: string}[] = [
    {color: "#5865F2"},
    {color: "#ED6A5E"},
    {color: "#F4BD50", textColor: "#3a2a00"},
    {color: "#3a3b40"},
    {color: "#3BA55D"},
    {color: "#6441A5"},
];

export function colorFromId(id: string): {color: string; textColor?: string} {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}