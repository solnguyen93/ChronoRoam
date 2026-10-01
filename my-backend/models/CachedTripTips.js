const pool = require('../db');

// Columns returned for cached Trip Tips.
const FIELDS = `title_key AS "titleKey", destination_key AS "destinationKey", has_destination AS "hasDestination", tip_text AS "tipText",
    source_label AS "sourceLabel", source_url AS "sourceUrl", resolved_city AS "resolvedCity",
    resolved_country AS "resolvedCountry", resolved_lat AS "resolvedLat", resolved_lon AS "resolvedLon",
    experiential_tips_json AS "experientialTips", multi_weather_summary AS "multiWeatherSummary", last_verified AS "lastVerified"`;

// Cache of Trip Tips (visa tip plus local tips), shared by every user. Looked up by trip title
// and passport country, since the visa tip depends on the passport. Also findable by
// destination (destination_key), so differently worded titles for the same place ("Tokyo Trip",
// "Tokyo 2026") reuse one answer instead of each paying for a new AI call (see
// utils/aiDestinationResolver.js).
class CachedTripTips {
    // The title key: trimmed, lowercased, cut to 200 characters.
    static normalize(title) {
        return (title || '').trim().toLowerCase().slice(0, 200);
    }

    // The passport key; defaults to United States.
    static normalizePassport(passportCountry) {
        return (passportCountry || 'United States').trim().slice(0, 100);
    }

    // Cached tips for this exact title and passport, or null.
    static async get(title, passportCountry) {
        const key = CachedTripTips.normalize(title);
        if (!key) return null;
        const result = await pool.query(
            `SELECT ${FIELDS} FROM cached_trip_tips WHERE title_key = $1 AND passport_country = $2`,
            [key, CachedTripTips.normalizePassport(passportCountry)],
        );
        return result.rows[0] || null;
    }

    // Cached tips for this destination and passport from any title, the most recently checked
    // one if there are several, or null.
    static async getByDestinationKey(destinationKey, passportCountry) {
        if (!destinationKey) return null;
        const result = await pool.query(
            `SELECT ${FIELDS} FROM cached_trip_tips WHERE destination_key = $1 AND passport_country = $2 ORDER BY last_verified DESC LIMIT 1`,
            [destinationKey, CachedTripTips.normalizePassport(passportCountry)],
        );
        return result.rows[0] || null;
    }

    // Whether cached tips are over 75 days old and should be regenerated.
    static isStale(row, staleAfterDays = 75) {
        const ageMs = Date.now() - new Date(row.lastVerified).getTime();
        return ageMs > staleAfterDays * 24 * 60 * 60 * 1000;
    }

    // Saves (or replaces) the tips for a title and passport, and marks them as just checked.
    static async upsert(title, { destinationKey, hasDestination, tipText, sourceLabel, sourceUrl, resolvedCity, resolvedCountry, resolvedLat, resolvedLon, experientialTips }, passportCountry) {
        const key = CachedTripTips.normalize(title);
        if (!key) return null;
        const passport = CachedTripTips.normalizePassport(passportCountry);
        const result = await pool.query(
            `INSERT INTO cached_trip_tips (title_key, passport_country, destination_key, has_destination, tip_text, source_label, source_url, resolved_city, resolved_country, resolved_lat, resolved_lon, experiential_tips_json, last_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
             ON CONFLICT (title_key, passport_country) DO UPDATE SET
                destination_key = EXCLUDED.destination_key,
                has_destination = EXCLUDED.has_destination, tip_text = EXCLUDED.tip_text,
                source_label = EXCLUDED.source_label, source_url = EXCLUDED.source_url,
                resolved_city = EXCLUDED.resolved_city, resolved_country = EXCLUDED.resolved_country,
                resolved_lat = EXCLUDED.resolved_lat, resolved_lon = EXCLUDED.resolved_lon,
                experiential_tips_json = EXCLUDED.experiential_tips_json, last_verified = NOW()
             RETURNING ${FIELDS}`,
            [key, passport, destinationKey || null, !!hasDestination, tipText || null, sourceLabel || null, sourceUrl || null, resolvedCity || null, resolvedCountry || null, resolvedLat ?? null, resolvedLon ?? null, JSON.stringify(experientialTips || [])],
        );
        return result.rows[0];
    }

    // Saves the weather summary for a trip with several destinations. Kept separate from upsert so
    // saving it doesn't mark the rest of the tips as just checked.
    static async setMultiWeatherSummary(title, passportCountry, summary) {
        const key = CachedTripTips.normalize(title);
        if (!key) return null;
        const result = await pool.query(
            `UPDATE cached_trip_tips SET multi_weather_summary = $1 WHERE title_key = $2 AND passport_country = $3 RETURNING ${FIELDS}`,
            [summary || null, key, CachedTripTips.normalizePassport(passportCountry)],
        );
        return result.rows[0] || null;
    }
}

module.exports = CachedTripTips;
