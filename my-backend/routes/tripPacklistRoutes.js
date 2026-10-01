// /trips/:publicId/packlists routes: link packing lists to a trip, and edit a linked packing list
// from the trip page. Every route needs the user to be a member of the trip, and returns the
// trip with all its linked packing lists.
const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');
const Trip = require('../models/Trip');
const Packlist = require('../models/Packlist');
const PacklistItem = require('../models/PacklistItem');
const PacklistBag = require('../models/PacklistBag');
const TripPacklist = require('../models/TripPacklist');
const { ForbiddenError } = require('../expressError');
const { requireUser } = require('../middleware/auth');
const { TripMembership, PacklistMembership } = require('../models/Membership');
const { buildLinkedPacklists } = require('../utils/packlistPayload');
const { assertResourceQuota } = require('../utils/resourceQuota');

// The packing list named in the URL, if this user has it linked to this trip; otherwise a 403. Edits
// change the packing list itself, so they show everywhere it's used, including for other members
// who have it linked (use Duplicate for a separate copy).
async function requireLinkedPacklist(trip, userId, packlistId) {
    const packlist = await Packlist.getByPublicId(packlistId);
    if (!(await TripPacklist.isLinked(trip.id, userId, packlist.id))) throw new ForbiddenError('Not linked to this trip.');
    return packlist;
}

// Links a packing list to the trip: with forEveryone, for every current member and anyone who joins
// later; otherwise "Only me", just for this user. Each member can still unlink it for themselves.
async function linkForUserOrEveryone(trip, userId, packlistId, forEveryone, client = pool) {
    const userIds = forEveryone ? await TripMembership.memberUserIds(trip.id) : [userId];
    for (const id of userIds) await TripPacklist.link(trip.id, id, packlistId, forEveryone, client);
}

// Links a packing list to this trip, for this user or with forEveryone: true for everyone on it. If
// it's already linked for this user, returns 409 { alreadyLinked } so the app can offer to link a copy
// instead (LinkPacklistModal.js).
router.post('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await Packlist.getByPublicId(req.body.packlistId);
        if (await TripPacklist.isLinked(trip.id, user.id, packlist.id)) {
            return res.status(409).json({ alreadyLinked: true, packlist: { title: packlist.title } });
        }
        await linkForUserOrEveryone(trip, user.id, packlist.id, req.body.forEveryone === true);
        res.status(201).json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Copies a packing list, named "Copy of <name>", with the user as its only member, and links the
// copy to this trip. With replace: true (the Duplicate option on a linked list) the copy takes the
// original's place on this trip for this user only (other members keep the original) instead of
// being added next to it. Without replace, forEveryone: true links the copy for everyone on the trip.
// Guests are limited to 1 packing list. One transaction.
router.post('/duplicate-and-link', async (req, res) => {
    const client = await pool.connect();
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        await assertResourceQuota(user.id, 'packlist');
        const source = await Packlist.getByPublicId(req.body.packlistId);
        // Add " (1)", " (2)", ... if the user already has a list with that name.
        const title = await PacklistMembership.uniqueTitle(user.id, `Copy of ${source.title}`);
        await client.query('BEGIN');
        const copy = await Packlist.duplicate(req.body.packlistId, client, title);
        await PacklistMembership.ensureMember(copy.id, user.id, client);
        if (req.body.replace === true && await TripPacklist.isLinked(trip.id, user.id, source.id)) {
            await TripPacklist.repoint(trip.id, user.id, source.id, copy.id, client);
        } else {
            await linkForUserOrEveryone(trip, user.id, copy.id, req.body.forEveryone === true, client);
        }
        await client.query('COMMIT');
        res.status(201).json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ message: error.message });
    } finally {
        client.release();
    }
});

// Unlinks a packing list from this trip for this user only. The packing list itself and other
// members' links stay.
router.delete('/:packlistId', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await Packlist.getByPublicId(req.params.packlistId);
        await TripPacklist.unlink(trip.id, user.id, packlist.id);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Renames a linked packing list.
router.put('/:packlistId/rename', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await Packlist.rename(packlist.publicId, req.body.title);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Adds an item to a linked packing list (in a bag, or at the top when bagId is empty).
router.post('/:packlistId/items', async (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Text is required.' });
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistItem.add(packlist.id, req.body.bagId || null, text, {
            isHot: req.body.isHot, isCold: req.body.isCold, isLastMin: req.body.isLastMin,
        });
        res.status(201).json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Saves a new item order.
router.put('/:packlistId/items/reorder', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistItem.reorder(packlist.id, req.body.orderedIds || []);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Marks every item as not packed.
router.put('/:packlistId/items/uncheck-all', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistItem.uncheckAll(packlist.id);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Moves an item into another bag (or to the top) and saves that bag's order.
router.put('/:packlistId/items/:itemId/move', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistItem.move(req.params.itemId, packlist.id, req.body.bagId || null, req.body.orderedIds || []);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Edits an item: text, packed, or the old hot/cold/last-minute flags.
router.put('/:packlistId/items/:itemId', async (req, res) => {
    const changes = {};
    if ('text' in req.body) changes.text = req.body.text;
    if ('done' in req.body) changes.done = req.body.done;
    if ('isHot' in req.body) changes.isHot = req.body.isHot;
    if ('isCold' in req.body) changes.isCold = req.body.isCold;
    if ('isLastMin' in req.body) changes.isLastMin = req.body.isLastMin;
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistItem.update(req.params.itemId, packlist.id, changes);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes an item.
router.delete('/:packlistId/items/:itemId', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistItem.remove(req.params.itemId, packlist.id);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Adds a bag (inside another bag, or at the top when parentBagId is empty).
router.post('/:packlistId/bags', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistBag.create(packlist.id, req.body.parentBagId || null, req.body.name, req.body.color);
        res.status(201).json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Renames or recolors a bag.
router.put('/:packlistId/bags/:bagId', async (req, res) => {
    const changes = {};
    if ('name' in req.body) changes.name = req.body.name;
    if ('color' in req.body) changes.color = req.body.color;
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistBag.update(req.params.bagId, packlist.id, changes);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Moves a bag into another bag (or to the top) and saves that container's order.
router.put('/:packlistId/bags/:bagId/move', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistBag.move(req.params.bagId, packlist.id, req.body.parentBagId || null, req.body.orderedIds || []);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes a bag and everything in it.
router.delete('/:packlistId/bags/:bagId', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const packlist = await requireLinkedPacklist(trip, user.id, req.params.packlistId);
        await PacklistBag.remove(req.params.bagId, packlist.id);
        res.json({ trip, packlists: await buildLinkedPacklists(trip, user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
