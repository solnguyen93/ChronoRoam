import { AIRPORTS } from './airports';

// Shortens an airport name by dropping "International Airport" / "Airport": "Tokyo Haneda
// International Airport" -> "Tokyo Haneda".
function shortenAirportName(name) {
    const stripped = name.replace(/\s+(International\s+)?Airport$/i, '').trim();
    return stripped || name;
}

// Searches the bundled airport list (no network call): code matches first, then name or city
// matches. Returns up to 6, or [] for fewer than 2 characters.
export function searchAirports(query) {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const codeMatches = [];
    const nameMatches = [];

    for (const [code, name, city, country] of AIRPORTS) {
        const shortName = shortenAirportName(name);
        const entry = { label: `${shortName} (${code})`, code, name: shortName, city, country };
        if (code.toLowerCase().startsWith(q)) {
            codeMatches.push(entry);
        } else if (name.toLowerCase().includes(q) || city.toLowerCase().includes(q)) {
            nameMatches.push(entry);
        }
        if (codeMatches.length + nameMatches.length >= 30) break;
    }

    return [...codeMatches, ...nameMatches].slice(0, 6);
}
