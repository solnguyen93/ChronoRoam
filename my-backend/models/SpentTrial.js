const crypto = require('crypto');
const pool = require('../db');
// Credits in one purchase before the pack went from 1,000 to 100.
const LEGACY_PURCHASE_CREDITS = 1000;

// Remembers the emails and device IDs of deleted accounts (table spent_trials), so signing up
// again doesn't give new free credits, and so the leftover credits can be restored once.
//
// Only a one-way code is stored, never the email or device ID itself: hashValue turns
// email + secret key into a code that can't be turned back into the email. The checks here only
// need "has this been seen before?", which comparing codes answers.
//
// The key is JWT_SECRET. Changing it would make every stored code stop matching.
const HASH_PREFIX = 'h1:';

// The one-way code for an email or device ID ("h1:" + HMAC-SHA256). Emails are trimmed and
// lowercased first, so "A@x.com " and "a@x.com" get the same code.
function hashValue(kind, value) {
    const normalized = kind === 'email' ? String(value).trim().toLowerCase() : String(value);
    const digest = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${kind}:${normalized}`).digest('hex');
    return HASH_PREFIX + digest;
}

class SpentTrial {
    // Records an email or device ID. hadPurchase/platform: whether the account had bought credits,
    // and where. creditsLeft: its unused credits (free and purchased), which a restore gives back.
    // Only account deletion passes creditsLeft.
    static async record(kind, value, client = pool, hadPurchase = false, platform = null, creditsLeft = null) {
        if (!value) return;
        await SpentTrial.upsertHashed(client, kind, hashValue(kind, value), hadPurchase, platform, creditsLeft);
    }

    // Saves a row by its code. If the code is already saved: had_purchase stays true once true,
    // purchase_platform only changes when this record had a purchase, and credits_left only
    // changes when a new value is given.
    static async upsertHashed(client, kind, hashed, hadPurchase, platform, creditsLeft = null) {
        await client.query(
            `INSERT INTO spent_trials (kind, value, had_purchase, purchase_platform, credits_left) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (kind, value) DO UPDATE SET
               had_purchase = spent_trials.had_purchase OR EXCLUDED.had_purchase,
               purchase_platform = CASE WHEN EXCLUDED.had_purchase THEN EXCLUDED.purchase_platform ELSE spent_trials.purchase_platform END,
               credits_left = COALESCE(EXCLUDED.credits_left, spent_trials.credits_left)`,
            [kind, hashed, hadPurchase, hadPurchase ? platform : null, creditsLeft],
        );
    }

    // Returns the leftover credits saved for this email and sets them to 0, so they're only given
    // out once. Rows from before leftovers were saved (credits_left is null) give 1,000 (the pack size
    // back then) if that account had bought credits, otherwise 0.
    static async takeCreditsLeft(email, client = pool) {
        const result = await client.query(
            // The FROM subquery reads the row as it was before this UPDATE, so RETURNING gives the
            // balance being handed out while the row itself is set to 0.
            `UPDATE spent_trials s SET credits_left = 0
             FROM (SELECT credits_left, had_purchase FROM spent_trials WHERE kind = 'email' AND value = $1) old
             WHERE s.kind = 'email' AND s.value = $1
             RETURNING old.credits_left AS "creditsLeft", old.had_purchase AS "hadPurchase"`,
            [hashValue('email', email)],
        );
        const row = result.rows[0];
        if (!row) return 0;
        return row.creditsLeft ?? (row.hadPurchase ? LEGACY_PURCHASE_CREDITS : 0);
    }

    // Whether this email or device ID belonged to a deleted account.
    static async isSpent(kind, value) {
        if (!value) return false;
        const result = await pool.query(`SELECT 1 FROM spent_trials WHERE kind = $1 AND value = $2`, [kind, hashValue(kind, value)]);
        return !!result.rows[0];
    }

    // Where the deleted account with this email bought credits ('stripe' or 'apple'), or null if
    // it never did. The restored account gets the same purchase_platform.
    static async purchasePlatformFor(kind, value) {
        if (!value) return null;
        const result = await pool.query(`SELECT had_purchase, purchase_platform FROM spent_trials WHERE kind = $1 AND value = $2`, [kind, hashValue(kind, value)]);
        const platform = result.rows[0]?.had_purchase ? result.rows[0].purchase_platform : null;
        // 'promo' (credits from an old free giveaway) isn't a purchase, so it's treated as none.
        return platform === 'promo' ? null : platform;
    }

    // Converts rows saved before codes were used (plain emails or device IDs) into codes, merging
    // with a coded row for the same value if there is one. Runs at server startup; returns how
    // many rows it converted (0 once everything is converted).
    static async hashLegacyRows() {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `SELECT kind, value, had_purchase, purchase_platform FROM spent_trials WHERE value NOT LIKE $1 FOR UPDATE`,
                [`${HASH_PREFIX}%`],
            );
            for (const row of rows) {
                await SpentTrial.upsertHashed(client, row.kind, hashValue(row.kind, row.value), row.had_purchase, row.purchase_platform);
                await client.query(`DELETE FROM spent_trials WHERE kind = $1 AND value = $2`, [row.kind, row.value]);
            }
            await client.query('COMMIT');
            return rows.length;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = SpentTrial;
