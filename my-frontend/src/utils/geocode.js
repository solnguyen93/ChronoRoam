import ChronoRoamApi from '../api';

// Place name -> coordinates, through the server's shared cache (GET /geocode). Answers are also
// kept in memory for this visit, since many days often share a city.
const cache = {};

// { lat, lon, city, country } for a place, or null if not found or on an error.
async function geocode(query) {
    const key = query.trim().toLowerCase();
    if (!key) return null;
    if (cache[key] !== undefined) return cache[key];
    try {
        const result = await ChronoRoamApi.geocode(query);
        const resolved = result?.lat != null ? result : null;
        cache[key] = resolved;
        return resolved;
    } catch (e) {
        cache[key] = null;
        return null;
    }
}

// Up to 5 matching cities for the home location field (GET /geocode/search), like "Seattle,
// Washington, United States". Needs at least 2 characters.
export async function searchCities(query) {
    if (!query || query.trim().length < 2) return [];
    try {
        const { results } = await ChronoRoamApi.searchCities(query);
        return results || [];
    } catch (e) {
        return [];
    }
}

export default geocode;
