import { getServerUrl, getToken } from "./config.ts";

export class ApiError extends Error {
    status: number;
    errors?: unknown;

    constructor(status: number, message: string, errors?: unknown) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

interface ApiRequestOptions {
    method?: string;
    body?: unknown;
    formData?: FormData;
    authenticated?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const { method = "GET", body, formData, authenticated = true } = options;

    const serverUrl = await getServerUrl();
    if (!serverUrl) throw new ApiError(0, "Aucun serveur configuré.");

    const headers: Record<string, string> = {};
    if (!formData && body !== undefined) headers["Content-Type"] = "application/json";

    if (authenticated) {
        const token = await getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
        response = await fetch(`${serverUrl}${path}`, {
            method,
            headers,
            body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
        });
    } catch {
        throw new ApiError(0, "Serveur injoignable.");
    }

    if (!response.ok) {
        let message = `Erreur ${response.status}`;
        let errors: unknown;
        try {
            const data = await response.json();
            if (data?.errors) {
                errors = data.errors;
                message = "Erreur de validation.";
            } else if (data?.message) {
                message = data.message;
            }
        } catch {
            // corps d'erreur non-JSON, on garde le message générique
        }
        throw new ApiError(response.status, message, errors);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
}
