const pool = require('../db');

// Invites to join a trip or packing list, sent by username. Each invite is for either a trip
// (trip_id) or a packing list (packlist_id). Accepting or declining deletes it.
class Invite {
    // Saves an invite. Returns false if this person already has one for the same trip or list.
    static async create({ kind, resourceId, fromUserId, toUserId }) {
        const column = kind === 'trip' ? 'trip_id' : 'packlist_id';
        const result = await pool.query(
            `INSERT INTO invites (${column}, from_user_id, to_user_id) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING RETURNING id`,
            [resourceId, fromUserId, toUserId],
        );
        return result.rowCount > 0;
    }

    // This user's invites, newest first, each as { id, kind, publicId, title, startDate, endDate,
    // fromName }. Invites to something they've already joined (e.g. through the share link) are
    // deleted first.
    static async getForUser(userId) {
        await pool.query(
            `DELETE FROM invites i WHERE i.to_user_id = $1 AND (
                 EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = i.trip_id AND m.user_id = $1)
              OR EXISTS (SELECT 1 FROM packlist_members m WHERE m.packlist_id = i.packlist_id AND m.user_id = $1))`,
            [userId],
        );
        const result = await pool.query(
            `SELECT i.id,
                    CASE WHEN i.trip_id IS NOT NULL THEN 'trip' ELSE 'packlist' END AS kind,
                    COALESCE(t.public_id, p.public_id) AS "publicId",
                    COALESCE(t.title, p.title) AS title,
                    to_char(t.start_date, 'YYYY-MM-DD') AS "startDate",
                    to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
                    COALESCE(u.name, u.username) AS "fromName"
             FROM invites i
             LEFT JOIN trips t ON t.id = i.trip_id
             LEFT JOIN packlists p ON p.id = i.packlist_id
             JOIN users u ON u.id = i.from_user_id
             WHERE i.to_user_id = $1
             ORDER BY i.created_at DESC`,
            [userId],
        );
        return result.rows;
    }

    // One invite to this user (with its trip or packing list id), or null.
    static async getForRecipient(id, userId) {
        const result = await pool.query(
            `SELECT id, trip_id AS "tripId", packlist_id AS "packlistId" FROM invites WHERE id = $1 AND to_user_id = $2`,
            [id, userId],
        );
        return result.rows[0] || null;
    }

    static async remove(id) {
        await pool.query(`DELETE FROM invites WHERE id = $1`, [id]);
    }
}

module.exports = Invite;
