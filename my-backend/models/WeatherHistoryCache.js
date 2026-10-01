const pool = require('../db');

// Rounds a coordinate to 0.1° (about 11 km), so nearby places share one cached answer.
function round(n) {
    return Math.round(n * 10) / 10;
}

// Cache of typical weather (the average of the same calendar day over the last 3 years) by place
// and date, shared by every user. Used by each day's weather and by Trip Tips.
class WeatherHistoryCache {
    // The cached average for a place and month/day, or null.
    static async get(lat, lon, month, day) {
        const result = await pool.query(
            `SELECT hi_f AS "hiF", lo_f AS "loF", avg_humidity AS "avgHumidity", last_updated AS "lastUpdated"
             FROM weather_history_cache WHERE lat_rounded = $1 AND lon_rounded = $2 AND month = $3 AND day = $4`,
            [round(lat), round(lon), month, day],
        );
        return result.rows[0] || null;
    }

    // Saves (or replaces) the average for a place and month/day.
    static async upsert(lat, lon, month, day, { hiF, loF, avgHumidity }) {
        const result = await pool.query(
            `INSERT INTO weather_history_cache (lat_rounded, lon_rounded, month, day, hi_f, lo_f, avg_humidity, last_updated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (lat_rounded, lon_rounded, month, day) DO UPDATE SET
                hi_f = EXCLUDED.hi_f, lo_f = EXCLUDED.lo_f, avg_humidity = EXCLUDED.avg_humidity, last_updated = NOW()
             RETURNING hi_f AS "hiF", lo_f AS "loF", avg_humidity AS "avgHumidity", last_updated AS "lastUpdated"`,
            [round(lat), round(lon), month, day, hiF ?? null, loF ?? null, avgHumidity ?? null],
        );
        return result.rows[0];
    }

    // Whether a cached row is older than 180 days and should be recalculated, so a new year's
    // data gets included.
    static isStale(row, staleAfterDays = 180) {
        const ageMs = Date.now() - new Date(row.lastUpdated).getTime();
        return ageMs > staleAfterDays * 24 * 60 * 60 * 1000;
    }
}

module.exports = WeatherHistoryCache;
