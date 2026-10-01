const pool = require('../db');

const FIELDS = `id, user_id AS "userId", category, legs_json AS "legs", from_address AS "fromAddress", created_at AS "createdAt"`;

// Forwarded booking emails a user hasn't reviewed yet, one row each. Created by
// routes/webhookRoutes.js; listed and removed by routes/emailImportRoutes.js. Not tied to a
// trip — the user picks the trip when reviewing.
class PendingEmailImport {
    // Saves one extracted email (its category and item details) for a user.
    static async create(userId, { category, legs, fromAddress }) {
        const result = await pool.query(
            `INSERT INTO pending_email_imports (user_id, category, legs_json, from_address)
             VALUES ($1, $2, $3, $4) RETURNING ${FIELDS}`,
            [userId, category, JSON.stringify(legs), fromAddress || null],
        );
        return result.rows[0];
    }

    // A user's waiting emails, oldest first.
    static async listForUser(userId) {
        const result = await pool.query(
            `SELECT ${FIELDS} FROM pending_email_imports WHERE user_id = $1 ORDER BY created_at ASC`,
            [userId],
        );
        return result.rows;
    }

    // Removes one of this user's waiting emails. Another user's id matches nothing, so it's ignored.
    static async remove(id, userId) {
        await pool.query(`DELETE FROM pending_email_imports WHERE id = $1 AND user_id = $2`, [id, userId]);
    }
}

module.exports = PendingEmailImport;
