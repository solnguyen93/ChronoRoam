const pool = require('../db');
const { BadRequestError } = require('../expressError');

// Makes sure each Apple purchase adds credits only once, and only to one account. The same
// purchase can reach the server more than once (Apple resending it, or the app retrying).
class ApplePurchase {
    // Records the purchase for this user. Returns true the first time (add the credits), false if
    // this user already recorded it (skip). Throws if a different account already recorded it.
    static async claim(originalTransactionId, userId) {
        if (!originalTransactionId) return false;
        const inserted = await pool.query(
            `INSERT INTO apple_purchases (original_transaction_id, user_id) VALUES ($1, $2)
             ON CONFLICT (original_transaction_id) DO NOTHING RETURNING 1`,
            [originalTransactionId, userId],
        );
        const result = await pool.query(
            `SELECT user_id FROM apple_purchases WHERE original_transaction_id = $1`,
            [originalTransactionId],
        );
        if (result.rows[0]?.user_id !== userId) {
            throw new BadRequestError('This purchase is already associated with a different account.');
        }
        return inserted.rows.length > 0;
    }
}

module.exports = ApplePurchase;
