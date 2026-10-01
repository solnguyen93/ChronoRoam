const pool = require('../db');
const Trip = require('./Trip');
const Packlist = require('./Packlist');

// Links between trips and packing lists, per trip member. A trip can have several packing lists
// and a packing list can be linked to several trips. Each member has their own links, each either
// for everyone or "Only me" (forEveryone). Someone who joins a trip gets the lists linked for
// everyone (copyForNewMember); after that, linking, unlinking or swapping in a copy only changes
// that member's view. Members linked to the same packing list all edit that one list. Unlinking
// never deletes the trip or the packing list.
class TripPacklist {
    // Links a packing list to a trip for this user, for everyone or "Only me" (forEveryone false).
    // If it's already linked for them, it only changes from Only me to everyone, never back.
    static async link(tripId, userId, packlistId, forEveryone = true, client = pool) {
        await client.query(
            `INSERT INTO trip_packlists (trip_id, user_id, packlist_id, for_everyone) VALUES ($1, $2, $3, $4)
             ON CONFLICT (trip_id, user_id, packlist_id)
             DO UPDATE SET for_everyone = trip_packlists.for_everyone OR EXCLUDED.for_everyone`,
            [tripId, userId, packlistId, forEveryone],
        );
    }

    // Removes this user's link. The trip, the packing list and other members' links all stay.
    static async unlink(tripId, userId, packlistId) {
        await pool.query(
            `DELETE FROM trip_packlists WHERE trip_id = $1 AND user_id = $2 AND packlist_id = $3`,
            [tripId, userId, packlistId],
        );
    }

    // Removes all of this user's links on a trip (when they leave it).
    static async unlinkAllForUser(tripId, userId) {
        await pool.query(`DELETE FROM trip_packlists WHERE trip_id = $1 AND user_id = $2`, [tripId, userId]);
    }

    // Gives a new member the packing lists linked for everyone on the trip (by any other member),
    // keeping the earliest link time so they show in the same order. "Only me" lists aren't given.
    static async copyForNewMember(tripId, userId) {
        await pool.query(
            `INSERT INTO trip_packlists (trip_id, user_id, packlist_id, linked_at)
             SELECT $1, $2, packlist_id, MIN(linked_at) FROM trip_packlists
             WHERE trip_id = $1 AND user_id <> $2 AND for_everyone
             GROUP BY packlist_id
             ON CONFLICT (trip_id, user_id, packlist_id) DO NOTHING`,
            [tripId, userId],
        );
    }

    // The packing lists this user sees on a trip, oldest link first, so they always show in the same
    // order. getManyByIds returns them in any order, so they're put back in link order here. Each
    // also gets forEveryone: whether this user linked it for everyone or only for themselves.
    static async getForTrip(tripId, userId) {
        const result = await pool.query(
            `SELECT packlist_id AS "packlistId", for_everyone AS "forEveryone" FROM trip_packlists
             WHERE trip_id = $1 AND user_id = $2 ORDER BY linked_at ASC`,
            [tripId, userId],
        );
        const ids = result.rows.map((r) => r.packlistId);
        const packlists = await Packlist.getManyByIds(ids);
        const byId = Object.fromEntries(packlists.map((p) => [p.id, p]));
        return result.rows
            .filter((r) => byId[r.packlistId])
            .map((r) => ({ ...byId[r.packlistId], forEveryone: r.forEveryone }));
    }

    // The trips where this user has a packing list linked, oldest link first (used for the warning
    // before deleting a packing list).
    static async getTripsForPacklist(packlistId, userId) {
        const result = await pool.query(
            `SELECT trip_id AS "tripId" FROM trip_packlists
             WHERE packlist_id = $1 AND user_id = $2 ORDER BY linked_at ASC`,
            [packlistId, userId],
        );
        const ids = result.rows.map((r) => r.tripId);
        const trips = await Trip.getManyByIds(ids);
        const byId = Object.fromEntries(trips.map((t) => [t.id, t]));
        return ids.map((id) => byId[id]).filter(Boolean);
    }

    // Whether this packing list is linked to this trip for this user.
    static async isLinked(tripId, userId, packlistId) {
        const result = await pool.query(
            `SELECT 1 FROM trip_packlists WHERE trip_id = $1 AND user_id = $2 AND packlist_id = $3`,
            [tripId, userId, packlistId],
        );
        return !!result.rows[0];
    }

    // Points one of this user's links at a different packing list (used to swap a linked list for
    // the user's own copy, see tripPacklistRoutes.js). The copy is "Only me"; other members keep
    // the original.
    static async repoint(tripId, userId, oldPacklistId, newPacklistId, client = pool) {
        await client.query(
            `UPDATE trip_packlists SET packlist_id = $1, for_everyone = FALSE
             WHERE trip_id = $2 AND user_id = $3 AND packlist_id = $4`,
            [newPacklistId, tripId, userId, oldPacklistId],
        );
    }
}

module.exports = TripPacklist;
