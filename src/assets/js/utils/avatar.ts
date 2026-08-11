export function initials(username: string): string {
    return username.slice(0, 2).toUpperCase();
}

// L'API ne renvoie le hash d'avatar Discord que pour les comptes déjà
// connectés au moins une fois à Splatt (capturé au login OAuth) — pour les
// autres (ex. ami jamais connecté), pas de hash : on retombe sur les initiales.
export function avatarUrl(discordId: string, avatarHash: string | null | undefined): string | null {
    if (!avatarHash) return null;
    const ext = avatarHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`;
}

interface AvatarColor {
    color: string;
    textColor?: string;
}

// Repli si pas d'avatar : couleur dérivée d'un hash de l'id Discord, stable
// pour un même utilisateur.
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
