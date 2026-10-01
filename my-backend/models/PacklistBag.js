const pool = require('../db');
const { NotFoundError } = require('../expressError');

const BAG_FIELDS = `id, packlist_id AS "packlistId", parent_bag_id AS "parentBagId", name, color, position, created_at AS "createdAt"`;

// Bags in a packing list. A bag can sit inside another bag (parentBagId) or at the top (null).
class PacklistBag {
    // Every bag in the packing list as one flat list; the app builds the nesting from parentBagId.
    static async getAllForPacklist(packlistId) {
        const result = await pool.query(
            `SELECT ${BAG_FIELDS} FROM packlist_bags WHERE packlist_id = $1 ORDER BY position ASC`,
            [packlistId],
        );
        return result.rows;
    }

    // Adds a bag at the end of its container (another bag, or the top when parentBagId is null).
    static async create(packlistId, parentBagId, name, color) {
        const { rows: [{ next }] } = await pool.query(
            `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM packlist_bags WHERE packlist_id = $1 AND parent_bag_id IS NOT DISTINCT FROM $2`,
            [packlistId, parentBagId],
        );
        const result = await pool.query(
            `INSERT INTO packlist_bags (packlist_id, parent_bag_id, name, color, position)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${BAG_FIELDS}`,
            [packlistId, parentBagId, (name || 'Bag').trim(), color, next],
        );
        return result.rows[0];
    }

    // Renames or recolors a bag. Fields not in `changes` keep their current value.
    static async update(id, packlistId, changes = {}) {
        const existing = await pool.query(`SELECT ${BAG_FIELDS} FROM packlist_bags WHERE id = $1 AND packlist_id = $2`, [id, packlistId]);
        if (!existing.rows[0]) throw new NotFoundError('Bag not found');
        const merged = { ...existing.rows[0], ...changes };
        const result = await pool.query(
            `UPDATE packlist_bags SET name = $1, color = $2 WHERE id = $3 AND packlist_id = $4 RETURNING ${BAG_FIELDS}`,
            [merged.name.trim(), merged.color, id, packlistId],
        );
        return result.rows[0];
    }

    // Deletes a bag (the database also deletes everything inside it).
    static async remove(id, packlistId) {
        const result = await pool.query(`DELETE FROM packlist_bags WHERE id = $1 AND packlist_id = $2 RETURNING id`, [id, packlistId]);
        if (!result.rows[0]) throw new NotFoundError('Bag not found');
    }

    // Moves a bag into another container (null = the top), then saves the order of that
    // container's bags: each id's position becomes its index in orderedIds.
    static async move(id, packlistId, newParentBagId, orderedIds) {
        await pool.query(
            `UPDATE packlist_bags SET parent_bag_id = $1 WHERE id = $2 AND packlist_id = $3`,
            [newParentBagId, id, packlistId],
        );
        for (let i = 0; i < orderedIds.length; i++) {
            await pool.query(
                `UPDATE packlist_bags SET position = $1 WHERE id = $2 AND packlist_id = $3`,
                [i, orderedIds[i], packlistId],
            );
        }
        return PacklistBag.getAllForPacklist(packlistId);
    }
}

module.exports = PacklistBag;
