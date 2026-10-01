const pool = require('../db');

// Small schema changes applied to an existing database at server startup, before the server
// starts taking requests (see server.js). Each one checks first, so running them on every start
// is safe; schema.sql already has the end result for a fresh database.
//
// Column renames from when a purchase was treated as a separate "paid" kind of account — there's
// only guests and users now, and buying credits just adds to the balance:
//   users.paid_platform          -> users.purchase_platform
//   users.paid_at                -> users.first_purchased_at
//   spent_trials.was_paid        -> spent_trials.had_purchase
//   spent_trials.was_paid_platform -> spent_trials.purchase_platform
const COLUMN_RENAMES = [
    ['users', 'paid_platform', 'purchase_platform'],
    ['users', 'paid_at', 'first_purchased_at'],
    ['spent_trials', 'was_paid', 'had_purchase'],
    ['spent_trials', 'was_paid_platform', 'purchase_platform'],
];

// Renames a column if it still has the old name. Returns whether it did.
async function renameColumnIfPresent(client, table, from, to) {
    const { rows } = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
        [table, from],
    );
    if (!rows[0]) return false;
    await client.query(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
    return true;
}

// Gives each trip member their own packing list links (trip_packlists.user_id). Before this, a
// link was shared by everyone on the trip, so every current member gets a copy of each link.
// Returns whether it ran.
async function addPerUserPacklistLinks(client) {
    const { rows } = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'trip_packlists' AND column_name = 'user_id'`,
    );
    if (rows[0]) return false;
    await client.query(`ALTER TABLE trip_packlists ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
    // The old primary key (trip_id, packlist_id) would block one row per member; its name is looked
    // up rather than assumed.
    const { rows: [pk] } = await client.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'trip_packlists'::regclass AND contype = 'p'`,
    );
    if (pk) await client.query(`ALTER TABLE trip_packlists DROP CONSTRAINT ${pk.conname}`);
    await client.query(`
        INSERT INTO trip_packlists (trip_id, user_id, packlist_id, linked_at)
        SELECT tp.trip_id, tm.user_id, tp.packlist_id, tp.linked_at
        FROM trip_packlists tp JOIN trip_members tm ON tm.trip_id = tp.trip_id
        WHERE tp.user_id IS NULL`);
    await client.query(`DELETE FROM trip_packlists WHERE user_id IS NULL`);
    await client.query(`ALTER TABLE trip_packlists ALTER COLUMN user_id SET NOT NULL`);
    await client.query(`ALTER TABLE trip_packlists ADD PRIMARY KEY (trip_id, user_id, packlist_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trip_packlists_user_id ON trip_packlists(user_id)`);
    return true;
}

// Applies every change above in one transaction.
async function runMigrations() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const [table, from, to] of COLUMN_RENAMES) {
            if (await renameColumnIfPresent(client, table, from, to)) console.log(`migrations: renamed ${table}.${from} to ${to}`);
        }
        // A deleted account's leftover credits (see SpentTrial.takeCreditsLeft).
        await client.query(`ALTER TABLE spent_trials ADD COLUMN IF NOT EXISTS credits_left INTEGER`);
        if (await addPerUserPacklistLinks(client)) console.log('migrations: trip packing list links are now per member');
        // "Everyone" vs "Only me" packing list links; existing links are for everyone.
        await client.query(`ALTER TABLE trip_packlists ADD COLUMN IF NOT EXISTS for_everyone BOOLEAN NOT NULL DEFAULT TRUE`);
        // Invites to a trip or packing list (see models/Invite.js).
        await client.query(`CREATE TABLE IF NOT EXISTS invites (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    packlist_id INTEGER REFERENCES packlists(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK ((trip_id IS NULL) <> (packlist_id IS NULL))
)`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_trip ON invites(trip_id, to_user_id) WHERE trip_id IS NOT NULL`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_packlist ON invites(packlist_id, to_user_id) WHERE packlist_id IS NOT NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_invites_to_user ON invites(to_user_id)`);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
