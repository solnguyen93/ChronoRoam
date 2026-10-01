const pool = require('../db');
const { ForbiddenError } = require('../expressError');

// Who can open a trip or packing list. The same code serves both: membership() builds the methods
// for one members table (TripMembership and PacklistMembership at the bottom).
function membership(table, fkColumn, parentTable) {
    return {
        // Adds a member (on create, or opening a share link). If they're already a member, just
        // updates last_accessed_at, which the Home list sorts by. Takes an optional transaction
        // client so it can join the create's transaction.
        async ensureMember(resourceId, userId, client = pool) {
            await client.query(
                `INSERT INTO ${table} (${fkColumn}, user_id) VALUES ($1, $2)
                 ON CONFLICT (${fkColumn}, user_id) DO UPDATE SET last_accessed_at = NOW()`,
                [resourceId, userId],
            );
        },

        // Updates last_accessed_at if this user is already a member, and returns whether they are.
        // Never adds anyone: only a share link (?join=1) does that, so visiting a plain link or a
        // background refresh can't add someone to a trip.
        async touchMember(resourceId, userId) {
            const result = await pool.query(
                `UPDATE ${table} SET last_accessed_at = NOW() WHERE ${fkColumn} = $1 AND user_id = $2 RETURNING 1`,
                [resourceId, userId],
            );
            return result.rowCount > 0;
        },

        // The user ids of every member.
        async memberUserIds(resourceId) {
            const result = await pool.query(`SELECT user_id AS "userId" FROM ${table} WHERE ${fkColumn} = $1`, [resourceId]);
            return result.rows.map((r) => r.userId);
        },

        // Throws a 403 unless this user is a member. Checked before any change to a trip's or
        // packing list's contents.
        async requireMember(resourceId, userId) {
            const result = await pool.query(
                `SELECT 1 FROM ${table} WHERE ${fkColumn} = $1 AND user_id = $2`,
                [resourceId, userId],
            );
            if (!result.rows[0]) throw new ForbiddenError('Not a member.');
        },

        // "Delete" for a user: removes only their membership. When the last member leaves, the trip
        // or packing list itself is deleted. Returns { purged } saying whether that happened.
        async removeMember(resourceId, userId) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`DELETE FROM ${table} WHERE ${fkColumn} = $1 AND user_id = $2`, [resourceId, userId]);
                const { rows: [{ count }] } = await client.query(`SELECT COUNT(*) FROM ${table} WHERE ${fkColumn} = $1`, [resourceId]);
                const purged = Number(count) === 0;
                if (purged) await client.query(`DELETE FROM ${parentTable} WHERE id = $1`, [resourceId]);
                await client.query('COMMIT');
                return { purged };
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        },

        // The ids of everything this user is a member of, for their Home list: most recently opened
        // first, then most recently joined, then highest id (so ties always come out in the same
        // order).
        async getMemberResourceIds(userId) {
            const result = await pool.query(
                `SELECT ${fkColumn} AS "resourceId" FROM ${table} WHERE user_id = $1
                 ORDER BY last_accessed_at DESC, joined_at DESC, ${fkColumn} DESC`,
                [userId],
            );
            return result.rows.map((r) => r.resourceId);
        },

        // How many this user is a member of, including ones shared with them (used for the guest
        // limit in utils/resourceQuota.js).
        async countForUser(userId) {
            const result = await pool.query(`SELECT COUNT(*) FROM ${table} WHERE user_id = $1`, [userId]);
            return Number(result.rows[0].count);
        },

        // Whether this user already has one with this title (ignoring case). Other users' titles
        // don't count. excludeId skips the one being renamed, so renaming to the same name is fine.
        async titleTaken(userId, title, excludeId = null) {
            const result = await pool.query(
                `SELECT 1 FROM ${parentTable} p
                 JOIN ${table} m ON m.${fkColumn} = p.id
                 WHERE m.user_id = $1 AND LOWER(p.title) = LOWER($2) AND p.id != $3`,
                [userId, title, excludeId || 0],
            );
            return !!result.rows[0];
        },

        // Returns baseTitle if this user doesn't have it yet, otherwise adds " (1)", " (2)", ...
        // until it's unique among their own. Used on create, rename and duplicate.
        async uniqueTitle(userId, baseTitle, excludeId = null) {
            if (!(await this.titleTaken(userId, baseTitle, excludeId))) return baseTitle;
            let n = 1;
            while (await this.titleTaken(userId, `${baseTitle} (${n})`, excludeId)) n += 1;
            return `${baseTitle} (${n})`;
        },
    };
}

const TripMembership = membership('trip_members', 'trip_id', 'trips');
const PacklistMembership = membership('packlist_members', 'packlist_id', 'packlists');

module.exports = { TripMembership, PacklistMembership };
