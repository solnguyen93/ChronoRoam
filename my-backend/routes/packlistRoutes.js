// /packlists routes: create, list, open, rename, duplicate and delete packing lists.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const Packlist = require('../models/Packlist');
const PacklistItem = require('../models/PacklistItem');
const PacklistBag = require('../models/PacklistBag');
const { requireUser } = require('../middleware/auth');
const { PacklistMembership, TripMembership } = require('../models/Membership');
const { NotFoundError } = require('../expressError');
const TripPacklist = require('../models/TripPacklist');
const { assertResourceQuota } = require('../utils/resourceQuota');

// A packing list with its items and bags.
async function packlistPayload(packlist) {
    const [items, bags] = await Promise.all([PacklistItem.getAll(packlist.id), PacklistBag.getAllForPacklist(packlist.id)]);
    return { packlist, items, bags };
}

// Creates an empty packing list with the user as its only member, in one transaction so it's
// never left with no members. Guests are limited to 1.
router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const user = requireUser(res);
        await assertResourceQuota(user.id, 'packlist');
        const title = await PacklistMembership.uniqueTitle(user.id, (req.body.title || 'Packlist').trim());
        await client.query('BEGIN');
        const packlist = await Packlist.create(title, client);
        await PacklistMembership.ensureMember(packlist.id, user.id, client);
        await client.query('COMMIT');
        res.status(201).json(await packlistPayload(packlist));
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ message: error.message });
    } finally {
        client.release();
    }
});

// The user's packing lists for Home (lists only, no items), most recently opened first.
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const ids = await PacklistMembership.getMemberResourceIds(user.id);
        const packlists = await Packlist.getManyByIds(ids);
        const byId = Object.fromEntries(packlists.map((p) => [p.id, p]));
        res.json({ packlists: ids.map((id) => byId[id]).filter(Boolean) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Opens a packing list with its items. With ?join=1 (a share link) the user becomes a member;
// otherwise only existing members can open it, and anyone else gets a 404.
router.get('/:publicId', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        if (req.query.join === '1') await PacklistMembership.ensureMember(packlist.id, user.id);
        else if (!(await PacklistMembership.touchMember(packlist.id, user.id))) throw new NotFoundError('Packlist not found.');
        res.json(await packlistPayload(packlist));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// The trips where this user has this packing list linked (for the warning before deleting it; the
// app unlinks it from those trips first, which only changes this user's view). Only trips they're
// still a member of.
router.get('/:publicId/trips', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        const allTrips = await TripPacklist.getTripsForPacklist(packlist.id, user.id);
        const myTripIds = new Set(await TripMembership.getMemberResourceIds(user.id));
        const trips = allTrips.filter((t) => myTripIds.has(t.id));
        res.json({ trips });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Renames a packing list (members only). A title already used by another of the user's lists gets
// " (1)", " (2)", ... added.
router.put('/:publicId', async (req, res) => {
    try {
        const user = requireUser(res);
        const existing = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(existing.id, user.id);
        const rawTitle = (req.body.title || '').trim();
        const title = rawTitle ? await PacklistMembership.uniqueTitle(user.id, rawTitle, existing.id) : rawTitle;
        const packlist = await Packlist.rename(req.params.publicId, title);
        res.json(packlist);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Copies a packing list (bags and items) into a new one named "<name> (Copy)", with the user as
// its only member (members only; guests are limited to 1). One transaction, like create.
router.post('/:publicId/duplicate', async (req, res) => {
    const client = await pool.connect();
    try {
        const user = requireUser(res);
        await assertResourceQuota(user.id, 'packlist');
        const source = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(source.id, user.id);
        const title = await PacklistMembership.uniqueTitle(user.id, `${source.title} (Copy)`);
        await client.query('BEGIN');
        const packlist = await Packlist.duplicate(req.params.publicId, client, title);
        await PacklistMembership.ensureMember(packlist.id, user.id, client);
        await client.query('COMMIT');
        res.status(201).json(await packlistPayload(packlist));
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ message: error.message });
    } finally {
        client.release();
    }
});

// "Deletes" a packing list for this user: removes their membership. The list itself is deleted
// only when its last member leaves.
router.delete('/:publicId', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.removeMember(packlist.id, user.id);
        res.status(204).end();
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
