const pool = require('../db');

// Counts calls to outside APIs that have a monthly limit (AeroDataBox 300/month, AviationStack
// 100/month — see routes/flightRoutes.js), per provider per month. Only real calls are counted,
// not answers served from our cache.
class ApiUsage {
    // This month as "YYYY-MM".
    static currentMonth() {
        return new Date().toISOString().slice(0, 7); // "YYYY-MM"
    }

    // How many calls to this provider this month.
    static async getCount(provider) {
        const month = ApiUsage.currentMonth();
        const result = await pool.query('SELECT count FROM api_usage WHERE provider = $1 AND month = $2', [provider, month]);
        return result.rows[0]?.count ?? 0;
    }

    // Adds one call for this month and returns the new count, in a single query so two calls at
    // the same moment can't both read the old count.
    static async increment(provider) {
        const month = ApiUsage.currentMonth();
        const result = await pool.query(
            `INSERT INTO api_usage (provider, month, count) VALUES ($1, $2, 1)
             ON CONFLICT (provider, month) DO UPDATE SET count = api_usage.count + 1
             RETURNING count`,
            [provider, month],
        );
        return result.rows[0].count;
    }
}

module.exports = ApiUsage;
