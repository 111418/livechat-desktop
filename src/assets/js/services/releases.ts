const REPO = "111418/livechat-desktop";

export interface ReleaseInfo {
    tag: string;
    name: string;
    body: string;
    publishedAt: string;
    htmlUrl: string;
}

interface GithubReleaseRow {
    tag_name: string;
    name: string | null;
    body: string | null;
    published_at: string | null;
    draft: boolean;
    prerelease: boolean;
    html_url: string;
}

// API publique GitHub, pas besoin de token (repo public) : limitée à 60
// requêtes/heure par IP, largement suffisant pour un affichage occasionnel.
export async function fetchReleases(limit = 10): Promise<ReleaseInfo[]> {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${limit}`);
    if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);
    const rows = (await response.json()) as GithubReleaseRow[];
    return rows
        .filter((r) => !r.draft && !r.prerelease)
        .map((r) => ({
            tag: r.tag_name,
            name: r.name || r.tag_name,
            body: r.body ?? "",
            publishedAt: r.published_at ?? "",
            htmlUrl: r.html_url,
        }));
}
