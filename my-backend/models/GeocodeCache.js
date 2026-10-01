const pool = require('../db');

// The cache key: trimmed, lowercased, and cut to 200 characters (the column's size), so an
// overly long place name can't cause a database error.
function normalize(query) {
    return (query || '').trim().toLowerCase().slice(0, 200);
}

// Cache of place name -> coordinates (looked up with Open-Meteo), shared by every user. Used by
// the web app (GET /geocode) and by Trip Tips (tripTipsShared.js's geocodeCity).
class GeocodeCache {
    // The cached place, or null.
    static async get(query) {
        const key = normalize(query);
        if (!key) return null;
        const result = await pool.query(
            'SELECT lat, lon, city, country, last_updated AS "lastUpdated" FROM geocode_cache WHERE query_key = $1',
            [key],
        );
        return result.rows[0] || null;
    }

    // Saves (or replaces) a place. City and country are cut to 200 characters too.
    static async upsert(query, { lat, lon, city, country }) {
        const key = normalize(query);
        if (!key) return null;
        const result = await pool.query(
            `INSERT INTO geocode_cache (query_key, lat, lon, city, country, last_updated)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (query_key) DO UPDATE SET
                lat = EXCLUDED.lat, lon = EXCLUDED.lon, city = EXCLUDED.city, country = EXCLUDED.country, last_updated = NOW()
             RETURNING lat, lon, city, country, last_updated AS "lastUpdated"`,
            [key, lat ?? null, lon ?? null, (city || '').slice(0, 200) || null, (country || '').slice(0, 200) || null],
        );
        return result.rows[0];
    }

    // Whether a cached row is over a year old and should be looked up again (in case an old
    // answer, like "not found", was wrong).
    static isStale(row, staleAfterDays = 365) {
        const ageMs = Date.now() - new Date(row.lastUpdated).getTime();
        return ageMs > staleAfterDays * 24 * 60 * 60 * 1000;
    }
}

module.exports = GeocodeCache;
