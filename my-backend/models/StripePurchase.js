const pool = require('../db');

// Makes sure each Stripe purchase adds credits only once. Stripe can send the same
// "payment completed" event more than once (see routes/stripeWebhook.js).
class StripePurchase {
    // Records the checkout session. Returns true the first time, false if it was already
    // recorded (so the caller skips adding credits again).
    static async claim(sessionId, userId) {
        const result = await pool.query(
            `INSERT INTO stripe_purchases (session_id, user_id) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING RETURNING 1`,
            [sessionId, userId],
        );
        return result.rows.length > 0;
    }
}

module.exports = StripePurchase;
