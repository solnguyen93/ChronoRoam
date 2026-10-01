const pool = require('../db');
const { NotFoundError } = require('../expressError');

const ITEM_FIELDS = `id, packlist_id AS "packlistId", bag_id AS "bagId", text, done,
    is_hot AS "isHot", is_cold AS "isCold", is_last_min AS "isLastMin", position, created_at AS "createdAt"`;

// Items in a packing list. An item sits inside a bag (bagId) or at the top (null).
class PacklistItem {
    // Every item in the packing list, in order.
    static async getAll(packlistId) {
        const result = await pool.query(
            `SELECT ${ITEM_FIELDS} FROM packlist_items WHERE packlist_id = $1 ORDER BY position ASC`,
            [packlistId],
        );
        return result.rows;
    }

    // Adds an item at the end of its container (a bag, or the top when bagId is null). `tags` can
    // set the old hot/cold/last-minute flags.
    static async add(packlistId, bagId, text, tags = {}) {
        const { rows: [{ next }] } = await pool.query(
            `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM packlist_items WHERE packlist_id = $1 AND bag_id IS NOT DISTINCT FROM $2`,
            [packlistId, bagId],
        );
        const result = await pool.query(
            `INSERT INTO packlist_items (packlist_id, bag_id, text, position, is_hot, is_cold, is_last_min)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING ${ITEM_FIELDS}`,
            [packlistId, bagId, text.trim(), next, Boolean(tags.isHot), Boolean(tags.isCold), Boolean(tags.isLastMin)],
        );
        return result.rows[0];
    }

    // Updates only the fields given in `changes`; a missing field is passed as null and COALESCE
    // keeps the current value. Done in one UPDATE so two quick changes to different fields can't
    // overwrite each other. Uses ?? so false is kept as a real value.
    static async update(id, packlistId, changes = {}) {
        const result = await pool.query(
            `UPDATE packlist_items
             SET text = COALESCE($1, text), done = COALESCE($2, done),
                 is_hot = COALESCE($3, is_hot), is_cold = COALESCE($4, is_cold), is_last_min = COALESCE($5, is_last_min)
             WHERE id = $6 AND packlist_id = $7
             RETURNING ${ITEM_FIELDS}`,
            [
                changes.text !== undefined ? changes.text.trim() : null,
                changes.done ?? null,
                changes.isHot ?? null,
                changes.isCold ?? null,
                changes.isLastMin ?? null,
                id, packlistId,
            ],
        );
        if (!result.rows[0]) throw new NotFoundError('Packlist item not found');
        return result.rows[0];
    }

    // Deletes an item.
    static async remove(id, packlistId) {
        const result = await pool.query(`DELETE FROM packlist_items WHERE id = $1 AND packlist_id = $2 RETURNING id`, [id, packlistId]);
        if (!result.rows[0]) throw new NotFoundError('Packlist item not found');
    }

    // Saves a new order (each id's position becomes its index) without moving items between bags.
    static async reorder(packlistId, orderedIds) {
        for (let i = 0; i < orderedIds.length; i++) {
            await pool.query(
                `UPDATE packlist_items SET position = $1 WHERE id = $2 AND packlist_id = $3`,
                [i, orderedIds[i], packlistId],
            );
        }
        return PacklistItem.getAll(packlistId);
    }

    // Marks every item in the packing list as not packed.
    static async uncheckAll(packlistId) {
        await pool.query(`UPDATE packlist_items SET done = FALSE WHERE packlist_id = $1`, [packlistId]);
        return PacklistItem.getAll(packlistId);
    }

    // Moves an item into another bag (null = the top), then saves that container's order: each
    // id's position becomes its index in orderedIds.
    static async move(id, packlistId, newBagId, orderedIds) {
        await pool.query(
            `UPDATE packlist_items SET bag_id = $1 WHERE id = $2 AND packlist_id = $3`,
            [newBagId, id, packlistId],
        );
        for (let i = 0; i < orderedIds.length; i++) {
            await pool.query(
                `UPDATE packlist_items SET position = $1 WHERE id = $2 AND packlist_id = $3`,
                [i, orderedIds[i], packlistId],
            );
        }
        return PacklistItem.getAll(packlistId);
    }
}

module.exports = PacklistItem;
