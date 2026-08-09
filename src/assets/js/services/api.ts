import { getServerUrl, getToken } from "./config.ts";

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function resolveBaseUrl(): Promise<string> {
    const url = await getServerUrl();
    if (!url) throw new Error("Aucune URL de serveur configurée.");
    return url.replace(/\/+$/, "");
}

async function parseErrorMessage(res: Response): Promise<string> {
    try {
        const body = await res.json();
        if (typeof body?.message === "string") return body.message;
        if (Array.isArray(body?.errors) && body.errors.length) {
            return body.errors.map((e: any) => e.message ?? JSON.stringify(e)).join(", ");
        }
    } catch {
        // corps non-JSON, on retombe sur le statut HTTP
    }
    return `Erreur ${res.status}`;
}

export interface ApiRequestOptions {
    method?: string;
    body?: unknown;
    /** multipart/form-data — ne pas sérialiser en JSON, ne pas fixer de Content-Type (laisser le navigateur poser la boundary) */
    formData?: FormData;
    /** false pour les routes publiques (/auth/discord-login, /auth/login) */
    authenticated?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const base = await resolveBaseUrl();
    const headers: Record<string, string> = {};

    if (options.authenticated !== false) {
        const token = await getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    let body: BodyInit | undefined;
    if (options.formData) {
        body = options.formData;
    } else if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.body);
    }

    let res: Response;
    try {
        res = await fetch(`${base}${path}`, {
            method: options.method ?? "GET",
            headers,
            body,
        });
    } catch {
        throw new Error("Impossible de joindre le serveur.");
    }

    if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));

    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
}
