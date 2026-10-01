const PHOTON_BASE = 'https://photon.komoot.io/api/';

// Searches places, including businesses like restaurants and hotels, with Photon (free, no key,
// OpenStreetMap data). Returns up to 5 { label, lat, lon }, or [] for fewer than 3 characters or on
// an error. Airports use utils/airportSearch.js instead.
export async function searchPlaces(query) {
    const trimmed = (query || '').trim();
    if (trimmed.length < 3) return [];

    try {
        const url = `${PHOTON_BASE}?q=${encodeURIComponent(trimmed)}&limit=5&lang=en`;
        const res = await fetch(url);
        const json = await res.json();
        return (json.features || [])
            .map((f) => {
                const p = f.properties || {};
                const [lon, lat] = f.geometry?.coordinates || [];
                const area = [p.district || p.locality, p.city || p.state].filter(Boolean).join(', ');
                const label = p.name ? (area ? `${p.name} — ${area}` : p.name) : area;
                return label ? { label, lat, lon } : null;
            })
            .filter(Boolean);
    } catch (err) {
        return [];
    }
}
