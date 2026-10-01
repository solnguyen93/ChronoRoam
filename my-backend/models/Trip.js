const crypto = require('crypto');
const pool = require('../db');
const { NotFoundError } = require('../expressError');

// memberCount is how many people are on the trip (more than 1 shows the shared icon in the app).
const TRIP_FIELDS = `id, public_id AS "publicId", title,
    to_char(start_date, 'YYYY-MM-DD') AS "startDate",
    to_char(end_date, 'YYYY-MM-DD') AS "endDate",
    day_titles AS "dayTitles",
    destinations,
    todo_title AS "todoTitle",
    created_at AS "createdAt",
    (SELECT COUNT(*)::int FROM trip_members m WHERE m.trip_id = trips.id) AS "memberCount"`;

// Trips: title, dates, destinations, day names and the to-do list's title. Who can open a trip is
// decided by trip_members (see Membership.js), not here.
class Trip {
    // Creates a trip with a random public id (used in its link). Takes an optional transaction
    // client so the route can add the creator as a member in the same transaction (tripRoutes.js).
    static async create(title, startDate, endDate, client = pool, destinations = []) {
        const publicId = crypto.randomBytes(9).toString('base64url');
        const result = await client.query(
            `INSERT INTO trips (public_id, title, start_date, end_date, destinations)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${TRIP_FIELDS}`,
            [publicId, title, startDate, endDate, destinations],
        );
        return result.rows[0];
    }

    // A trip by its public id, or a 404.
    static async getByPublicId(publicId) {
        const result = await pool.query(`SELECT ${TRIP_FIELDS} FROM trips WHERE public_id = $1`, [publicId]);
        if (!result.rows[0]) throw new NotFoundError('Trip not found');
        return result.rows[0];
    }

    // Trips by their numeric ids, in no particular order (the caller sorts them).
    static async getManyByIds(ids) {
        if (!ids.length) return [];
        const result = await pool.query(`SELECT ${TRIP_FIELDS} FROM trips WHERE id = ANY($1)`, [ids]);
        return result.rows;
    }

    // Updates title, dates and destinations. Fields not in `changes` keep their current value.
    static async update(publicId, changes = {}) {
        const trip = await Trip.getByPublicId(publicId);
        const merged = { ...trip, ...changes };
        const result = await pool.query(
            `UPDATE trips SET title = $1, start_date = $2, end_date = $3, destinations = $4
             WHERE public_id = $5
             RETURNING ${TRIP_FIELDS}`,
            [merged.title, merged.startDate, merged.endDate, merged.destinations, publicId],
        );
        return result.rows[0];
    }

    // Sets one day's name (like "Disneyland Day"), or clears it when title is empty. Day names are
    // stored on the trip as a date -> name map.
    static async setDayTitle(publicId, dateISO, title) {
        const trip = await Trip.getByPublicId(publicId);
        const dayTitles = { ...trip.dayTitles };
        if (title) dayTitles[dateISO] = title;
        else delete dayTitles[dateISO];
        const result = await pool.query(
            `UPDATE trips SET day_titles = $1::jsonb WHERE public_id = $2 RETURNING ${TRIP_FIELDS}`,
            [JSON.stringify(dayTitles), publicId],
        );
        return result.rows[0];
    }

    // Sets the to-do list's title, or clears it (back to "To-Do") when title is empty.
    static async setTodoTitle(publicId, title) {
        const result = await pool.query(
            `UPDATE trips SET todo_title = $1 WHERE public_id = $2 RETURNING ${TRIP_FIELDS}`,
            [title || null, publicId],
        );
        if (!result.rows[0]) throw new NotFoundError('Trip not found');
        return result.rows[0];
    }

    // Deletes a trip; the database deletes its to-dos and day items with it.
    static async remove(publicId) {
        const result = await pool.query(`DELETE FROM trips WHERE public_id = $1 RETURNING id`, [publicId]);
        if (!result.rows[0]) throw new NotFoundError('Trip not found');
    }

    // Copies a trip (title, dates, day names, destinations, to-do title, to-dos and day items) into
    // a new, separate trip. The title defaults to "<name> (Copy)"; the route passes a unique one.
    // Takes an optional transaction client so all the inserts succeed or fail together.
    static async duplicate(publicId, client = pool, title = null) {
        const source = await Trip.getByPublicId(publicId);
        const newPublicId = crypto.randomBytes(9).toString('base64url');
        const { rows: [trip] } = await client.query(
            `INSERT INTO trips (public_id, title, start_date, end_date, day_titles, destinations, todo_title)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
             RETURNING ${TRIP_FIELDS}`,
            [newPublicId, title || `${source.title} (Copy)`, source.startDate, source.endDate, JSON.stringify(source.dayTitles), source.destinations, source.todoTitle],
        );
        await client.query(
            `INSERT INTO todos (trip_id, text, done, position)
             SELECT $1, text, done, position FROM todos WHERE trip_id = $2`,
            [trip.id, source.id],
        );
        await client.query(
            `INSERT INTO tasks (trip_id, day_date, text, done, fixed, flight, cat, fields, link, link_id, position)
             SELECT $1, day_date, text, done, fixed, flight, cat, fields, link, link_id, position FROM tasks WHERE trip_id = $2`,
            [trip.id, source.id],
        );
        return trip;
    }
}

module.exports = Trip;
