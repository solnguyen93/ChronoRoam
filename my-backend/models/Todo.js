const pool = require('../db');
const { NotFoundError } = require('../expressError');
const { cleanTags } = require('../utils/itemTags');

const TODO_FIELDS = `id, trip_id AS "tripId", text, done, tags, position, created_at AS "createdAt"`;

// A trip's to-do list items.
class Todo {
    // All of a trip's to-dos, in list order.
    static async getAll(tripId) {
        const result = await pool.query(
            `SELECT ${TODO_FIELDS} FROM todos WHERE trip_id = $1 ORDER BY position ASC`,
            [tripId],
        );
        return result.rows;
    }

    // Adds a to-do at the end of the list.
    static async add(tripId, text, tags = {}) {
        const { rows: [{ next }] } = await pool.query(
            `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM todos WHERE trip_id = $1`,
            [tripId],
        );
        const result = await pool.query(
            `INSERT INTO todos (trip_id, text, position, tags)
             VALUES ($1, $2, $3, $4::jsonb)
             RETURNING ${TODO_FIELDS}`,
            [tripId, text.trim(), next, JSON.stringify(cleanTags(tags))],
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
}

module.exports = Todo;
