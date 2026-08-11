export function initials(username: string): string {
    return username.slice(0, 2).toUpperCase();
}

interface AvatarColor {
    color: string;
    textColor?: string;
}

// L'API ne fournit ni avatar ni couleur par utilisateur : on en dérive une,
// stable pour un même id Discord, depuis une palette fixe.
const PALETTE: AvatarColor[] = [
    { color: "#5865F2" },
    { color: "#ED6A5E" },
    { color: "#F4BD50", textColor: "#3a2a00" },
    { color: "#3BA55D" },
    { color: "#6441A5" },
    { color: "#1DA1F2" },
    { color: "#3a3b40" },
];

export function colorFromId(id: string): AvatarColor {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % PALETTE.length;
    return PALETTE[index];
}
