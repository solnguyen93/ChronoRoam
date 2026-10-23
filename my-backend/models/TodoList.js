const pool = require('../db');
const { NotFoundError, BadRequestError } = require('../expressError');

const TODO_LIST_FIELDS = `id, trip_id AS "tripId", title, position, created_at AS "createdAt"`;

// A trip's named to-do lists (e.g. "To Do", "To Buy", "To Eat") — see utils/migrations.js's
// addTodoLists for why every trip always has at least one, and Todo.js for the items inside each.
class TodoList {
    // All of a trip's lists, in display order.
    static async getAll(tripId) {
        const result = await pool.query(
            `SELECT ${TODO_LIST_FIELDS} FROM todo_lists WHERE trip_id = $1 ORDER BY position ASC`,
            [tripId],
        );
        return result.rows;
    }

    // The trip's first list by position — every trip always has one, so this never returns
    // nothing. Used by the legacy (pre-multi-list) todo routes, which know nothing about lists.
    static async getDefault(tripId) {
        const result = await pool.query(
            `SELECT ${TODO_LIST_FIELDS} FROM todo_lists WHERE trip_id = $1 ORDER BY position ASC LIMIT 1`,
            [tripId],
        );
        if (!result.rows[0]) throw new NotFoundError('Trip has no to-do list');
        return result.rows[0];
    }

    // Adds a list at the end.
    static async create(tripId, title) {
        const { rows: [{ next }] } = await pool.query(
            `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM todo_lists WHERE trip_id = $1`,
            [tripId],
        );
        const result = await pool.query(
            `INSERT INTO todo_lists (trip_id, title, position) VALUES ($1, $2, $3) RETURNING ${TODO_LIST_FIELDS}`,
            [tripId, (title || 'To-Do').trim() || 'To-Do', next],
        );
        return result.rows[0];
    }

    static async rename(id, tripId, title) {
        const trimmed = (title || '').trim();
        if (!trimmed) throw new BadRequestError('Title is required.');
        const result = await pool.query(
            `UPDATE todo_lists SET title = $1 WHERE id = $2 AND trip_id = $3 RETURNING ${TODO_LIST_FIELDS}`,
            [trimmed, id, tripId],
        );
        if (!result.rows[0]) throw new NotFoundError('To-do list not found');
        // Keeps trips.todo_title (the already-shipped iOS app's only view of a to-do list's name)
        // in sync when the list renamed is the trip's default (first) one — see Trip.setTodoTitle.
        const { rows: [defaultList] } = await pool.query(
            `SELECT id FROM todo_lists WHERE trip_id = $1 ORDER BY position ASC LIMIT 1`, [tripId],
        );
        if (defaultList.id === result.rows[0].id) {
            await pool.query(`UPDATE trips SET todo_title = $1 WHERE id = $2`, [trimmed, tripId]);
        }
        return result.rows[0];
    }

    // Refuses to remove a trip's last remaining list — every trip always has at least one.
    static async remove(id, tripId) {
        const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM todo_lists WHERE trip_id = $1`, [tripId]);
        if (parseInt(count, 10) <= 1) throw new BadRequestError("Can't delete a trip's last to-do list.");
        const result = await pool.query(`DELETE FROM todo_lists WHERE id = $1 AND trip_id = $2 RETURNING id`, [id, tripId]);
        if (!result.rows[0]) throw new NotFoundError('To-do list not found');
    }
}

module.exports = TodoList;
