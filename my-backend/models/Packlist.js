const crypto = require('crypto');
const pool = require('../db');
const { NotFoundError, BadRequestError } = require('../expressError');

// memberCount is how many people have the packing list (more than 1 shows the shared icon in the app).
const PACKLIST_FIELDS = `id, public_id AS "publicId", title, created_at AS "createdAt",
    (SELECT COUNT(*)::int FROM packlist_members m WHERE m.packlist_id = packlists.id) AS "memberCount"`;

// Packing lists (title and public id). Their bags and items are in PacklistBag/PacklistItem;
// who can open one is decided by packlist_members (see Membership.js).
class Packlist {
    // Creates a packing list with a random public id. Takes an optional transaction client so the
    // route can add the creator as a member in the same transaction (packlistRoutes.js).
    static async create(title, client = pool) {
        const publicId = crypto.randomBytes(9).toString('base64url');
        const result = await client.query(
            `INSERT INTO packlists (public_id, title) VALUES ($1, $2) RETURNING ${PACKLIST_FIELDS}`,
            [publicId, (title || 'Packlist').trim()],
        );
        return result.rows[0];
    }

    // A packing list by its public id, or a 404.
    static async getByPublicId(publicId) {
        const result = await pool.query(`SELECT ${PACKLIST_FIELDS} FROM packlists WHERE public_id = $1`, [publicId]);
        if (!result.rows[0]) throw new NotFoundError('Packlist not found');
        return result.rows[0];
    }

    // A packing list by its numeric id, or a 404.
    static async getById(id) {
        const result = await pool.query(`SELECT ${PACKLIST_FIELDS} FROM packlists WHERE id = $1`, [id]);
        if (!result.rows[0]) throw new NotFoundError('Packlist not found');
        return result.rows[0];
    }

    // Packing lists by their numeric ids, in no particular order (the caller sorts them).
    static async getManyByIds(ids) {
        if (!ids.length) return [];
        const result = await pool.query(`SELECT ${PACKLIST_FIELDS} FROM packlists WHERE id = ANY($1)`, [ids]);
        return result.rows;
    }

    // Renames a packing list; the title can't be empty.
    static async rename(publicId, title) {
        if (!title || !title.trim()) throw new BadRequestError('Title is required.');
        const result = await pool.query(
            `UPDATE packlists SET title = $1 WHERE public_id = $2 RETURNING ${PACKLIST_FIELDS}`,
            [title.trim(), publicId],
        );
        if (!result.rows[0]) throw new NotFoundError('Packlist not found');
        return result.rows[0];
    }

    // Deletes a packing list; the database deletes its bags and items with it.
    static async remove(publicId) {
        const result = await pool.query(`DELETE FROM packlists WHERE public_id = $1 RETURNING id`, [publicId]);
        if (!result.rows[0]) throw new NotFoundError('Packlist not found');
    }

    // Copies every bag and item from one packing list into another, keeping the nesting. Returns
    // maps of old id -> new id for bags and items. Bags are copied in rounds: a bag is copied only
    // once its parent bag has been, so each copy can point at its parent's new id.
    static async _copyTree(sourceId, destId, client = pool) {
        const { rows: bags } = await client.query(
            `SELECT id, parent_bag_id AS "parentBagId", name, color, position FROM packlist_bags WHERE packlist_id = $1`,
            [sourceId],
        );
        const bagIdMap = {};
        let remaining = bags;
        while (remaining.length) {
            const [copyable, rest] = [[], []];
            for (const bag of remaining) {
                (bag.parentBagId === null || bagIdMap[bag.parentBagId] !== undefined ? copyable : rest).push(bag);
            }
            if (!copyable.length) break; // stop if the rest can't be placed (a broken tree), instead of looping forever
            for (const bag of copyable) {
                const newParentBagId = bag.parentBagId === null ? null : bagIdMap[bag.parentBagId];
                const { rows: [newBag] } = await client.query(
                    `INSERT INTO packlist_bags (packlist_id, parent_bag_id, name, color, position) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [destId, newParentBagId, bag.name, bag.color, bag.position],
                );
                bagIdMap[bag.id] = newBag.id;
            }
            remaining = rest;
        }

        const { rows: items } = await client.query(
            `SELECT id, bag_id AS "bagId", text, done, is_hot AS "isHot", is_cold AS "isCold", is_last_min AS "isLastMin", position
             FROM packlist_items WHERE packlist_id = $1 ORDER BY position ASC`,
            [sourceId],
        );
        const itemIdMap = {};
        for (const item of items) {
            const newBagId = item.bagId === null ? null : bagIdMap[item.bagId];
            const { rows: [newItem] } = await client.query(
                `INSERT INTO packlist_items (packlist_id, bag_id, text, done, is_hot, is_cold, is_last_min, position)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [destId, newBagId, item.text, item.done, item.isHot, item.isCold, item.isLastMin, item.position],
            );
            itemIdMap[item.id] = newItem.id;
        }

        return { bagIdMap, itemIdMap };
    }

    // Copies a packing list (bags and items) into a new, separate one. The title defaults to
    // "<name> (Copy)"; the route passes a unique one. Takes an optional transaction client so the
    // copy and the creator's membership succeed or fail together.
    static async duplicate(publicId, client = pool, title = null) {
        const source = await Packlist.getByPublicId(publicId);
        const newPublicId = crypto.randomBytes(9).toString('base64url');
        const { rows: [packlist] } = await client.query(
            `INSERT INTO packlists (public_id, title) VALUES ($1, $2) RETURNING ${PACKLIST_FIELDS}`,
            [newPublicId, title || `${source.title} (Copy)`],
        );
        await Packlist._copyTree(source.id, packlist.id, client);
        return packlist;
    }
}

module.exports = Packlist;
