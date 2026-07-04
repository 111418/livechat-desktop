export function initials(username : string): string{
    return username.slice(0, 2).toUpperCase();
}