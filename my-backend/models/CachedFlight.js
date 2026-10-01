const pool = require('../db');

// Columns returned for a cached flight. arrDayOffset is how many days after departure the flight
// lands (0 = same day) — the cache stores the route, not a date, and the app applies the offset
// to whatever date the user enters.
const FIELDS = `flight_number AS "flightNumber", airline, dep_airport AS "depAirport", dep_time AS "depTime",
    arr_airport AS "arrAirport", arr_time AS "arrTime", arr_day_offset AS "arrDayOffset", duration, last_updated AS "lastUpdated"`;

// Cache of flight routes by flight number, shared by every user (see routes/flightRoutes.js).
// A row is written by a fresh lookup or by a user correcting a field.
class CachedFlight {
    // The cache key: flight number trimmed and uppercased ("ua 837 " -> "UA 837").
    static normalize(flightNumber) {
        return (flightNumber || '').trim().toUpperCase();
    }

    // The cached flight, or null.
    static async get(flightNumber) {
        const key = CachedFlight.normalize(flightNumber);
        if (!key) return null;
        const result = await pool.query(`SELECT ${FIELDS} FROM cached_flights WHERE flight_number = $1`, [key]);
        return result.rows[0] || null;
    }

    // Saves a flight, fully replacing any cached row for that number (no merging), so a user's
    // correction overrides what the API said.
    static async upsert(flightNumber, { airline, depAirport, depTime, arrAirport, arrTime, arrDayOffset, duration }) {
        const key = CachedFlight.normalize(flightNumber);
        if (!key) return null;
        const result = await pool.query(
            `INSERT INTO cached_flights (flight_number, airline, dep_airport, dep_time, arr_airport, arr_time, arr_day_offset, duration, last_updated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (flight_number) DO UPDATE SET
                airline = EXCLUDED.airline, dep_airport = EXCLUDED.dep_airport, dep_time = EXCLUDED.dep_time,
                arr_airport = EXCLUDED.arr_airport, arr_time = EXCLUDED.arr_time, arr_day_offset = EXCLUDED.arr_day_offset,
                duration = EXCLUDED.duration, last_updated = NOW()
             RETURNING ${FIELDS}`,
            [key, airline || null, depAirport || null, depTime || null, arrAirport || null, arrTime || null, arrDayOffset ?? null, duration || null],
        );
        return result.rows[0];
    }
}

module.exports = CachedFlight;
