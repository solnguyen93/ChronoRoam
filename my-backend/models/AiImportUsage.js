const pool = require('../db');

// Counts each user's AI imports per month. Free credits left = allowance minus the lifetime
// total (see utils/importQuota.js).
class AiImportUsage {
    // This month as "YYYY-MM".
    static currentMonth() {
        return new Date().toISOString().slice(0, 7); // "YYYY-MM"
    }

    // This user's imports this month.
    static async getCount(userId) {
        const month = AiImportUsage.currentMonth();
        const result = await pool.query('SELECT count FROM ai_import_usage WHERE user_id = $1 AND month = $2', [userId, month]);
        return result.rows[0]?.count ?? 0;
    }

    // This user's imports across all months.
    static async getTotal(userId) {
        const result = await pool.query('SELECT COALESCE(SUM(count), 0)::int AS total FROM ai_import_usage WHERE user_id = $1', [userId]);
        return result.rows[0].total;
    }

    // Adds one import for this month and returns the new count, in a single query so two imports
    // at the same moment can't both read the old count.
    static async increment(userId) {
        const month = AiImportUsage.currentMonth();
        const result = await pool.query(
            `INSERT INTO ai_import_usage (user_id, month, count) VALUES ($1, $2, 1)
             ON CONFLICT (user_id, month) DO UPDATE SET count = ai_import_usage.count + 1
             RETURNING count`,
            [userId, month],
        );
        return result.rows[0].count;
    }
}

module.exports = AiImportUsage;
