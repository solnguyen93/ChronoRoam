const pool = require('../db');
const { NotFoundError } = require('../expressError');
const { cleanTags } = require('../utils/itemTags');
const TodoList = require('./TodoList');

const TODO_FIELDS = `id, trip_id AS "tripId", list_id AS "listId", text, done, tags, position, created_at AS "createdAt"`;

// A to-do list's items — see TodoList.js for the lists themselves. Every method below still takes
// tripId (not listId) and is kept exactly as it behaved before lists existed — these back the
// legacy (pre-multi-list) /trips/:id/todos routes that the already-shipped iOS app still calls,
// which know nothing about lists and expect one flat array for the whole trip. They always
// resolve to the trip's first/default list (see TodoList.getDefault). New, list-aware behavior
// (adding/reordering within one specific list) lives in the *InList methods further down.
class Todo {
    // All of a trip's to-dos, across every list, in list order. (Several lists' items all merged
    // into one flat array — exactly the shape this returned before lists existed.)
    static async getAll(tripId) {
        const result = await pool.query(
            `SELECT ${TODO_FIELDS} FROM todos WHERE trip_id = $1 ORDER BY position ASC`,
            [tripId],
        );
        return result.rows;
    }

    // Adds a to-do to the trip's default list.
    static async add(tripId, text, tags = {}) {
        const list = await TodoList.getDefault(tripId);
        return Todo.addToList(list.id, tripId, text, tags);
    }

    // All of one list's to-dos, in order.
    static async getAllForList(listId) {
        const result = await pool.query(
            `SELECT ${TODO_FIELDS} FROM todos WHERE list_id = $1 ORDER BY position ASC`,
            [listId],
        );
        return result.rows;
    }

    // Adds a to-do at the end of a specific list.
    static async addToList(listId, tripId, text, tags = {}) {
        const { rows: [{ next }] } = await pool.query(
            `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM todos WHERE list_id = $1`,
            [listId],
        );
        const result = await pool.query(
            `INSERT INTO todos (trip_id, list_id, text, position, tags)
             VALUES ($1, $2, $3, $4, $5::jsonb)
             RETURNING ${TODO_FIELDS}`,
            [tripId, listId, text.trim(), next, JSON.stringify(cleanTags(tags))],
        );
        return result.rows[0];
    }

    // Updates a to-do's text, done and tags. Fields not in `changes` keep their current value.
    static async update(id, tripId, changes = {}) {
        const existing = await pool.query(`SELECT ${TODO_FIELDS} FROM todos WHERE id = $1 AND trip_id = $2`, [id, tripId]);
        if (!existing.rows[0]) throw new NotFoundError('Todo not found');
        const merged = { ...existing.rows[0], ...changes };
        const result = await pool.query(
            `UPDATE todos SET text = $1, done = $2, tags = $3::jsonb
             WHERE id = $4 AND trip_id = $5
             RETURNING ${TODO_FIELDS}`,
            [merged.text.trim(), merged.done, JSON.stringify(cleanTags(merged.tags)), id, tripId],
        );
        return result.rows[0];
    }

    // Deletes a to-do.
    static async remove(id, tripId) {
        const result = await pool.query(`DELETE FROM todos WHERE id = $1 AND trip_id = $2 RETURNING id`, [id, tripId]);
        if (!result.rows[0]) throw new NotFoundError('Todo not found');
    }

    // Saves a new order: each id's position becomes its index in orderedIds.
    static async reorder(tripId, orderedIds) {
        for (let i = 0; i < orderedIds.length; i++) {
            await pool.query(`UPDATE todos SET position = $1 WHERE id = $2 AND trip_id = $3`, [i, orderedIds[i], tripId]);
        }
        return Todo.getAll(tripId);
    }

    // Marks every to-do in the trip as not done.
    static async uncheckAll(tripId) {
        await pool.query(`UPDATE todos SET done = false WHERE trip_id = $1`, [tripId]);
        return Todo.getAll(tripId);
    }

    // Saves a new order within one list: each id's position becomes its index in orderedIds.
    static async reorderInList(listId, orderedIds) {
        for (let i = 0; i < orderedIds.length; i++) {
            await pool.query(`UPDATE todos SET position = $1 WHERE id = $2 AND list_id = $3`, [i, orderedIds[i], listId]);
        }
        return Todo.getAllForList(listId);
    }

    // Marks every to-do in one list as not done.
    static async uncheckAllInList(listId) {
        await pool.query(`UPDATE todos SET done = false WHERE list_id = $1`, [listId]);
        return Todo.getAllForList(listId);
    }
}

module.exports = Todo;
