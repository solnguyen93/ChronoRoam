// /trips routes: create, list, open, edit, duplicate and delete trips.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const Trip = require('../models/Trip');
const Todo = require('../models/Todo');
const Task = require('../models/Task');
const { requireUser } = require('../middleware/auth');
const { TripMembership } = require('../models/Membership');
const TripPacklist = require('../models/TripPacklist');
const { NotFoundError } = require('../expressError');
const { buildLinkedPacklists } = require('../utils/packlistPayload');
const { assertResourceQuota } = require('../utils/resourceQuota');

// A trip with its to-dos, day items and this user's linked packing lists. userId is used to make the
// user a member of the linked packing lists too (see buildLinkedPacklists).
async function tripPayload(trip, userId) {
    const [todos, tasks, packlists] = await Promise.all([
        Todo.getAll(trip.id),
        Task.getAll(trip.id),
        buildLinkedPacklists(trip, userId),
    ]);
    return { trip, todos, tasks, packlists };
}

// Creates a trip (default title "Tokyo Trip", default dates today) with the user as its only
// member, in one transaction so the trip is never left with no members. Guests are limited to 1.
router.post('/', async (req, res) => {
    const title = (req.body.title || 'Tokyo Trip').trim();
    const today = new Date().toISOString().slice(0, 10);
    const startDate = req.body.startDate || today;
    const endDate = req.body.endDate || today;
    const destinations = (req.body.destinations || []).map((d) => (d || '').trim()).filter(Boolean);
    const client = await pool.connect();
    try {
        const user = requireUser(res);
        await assertResourceQuota(user.id, 'trip');
        const uniqueTitle = await TripMembership.uniqueTitle(user.id, title);
        await client.query('BEGIN');
        const trip = await Trip.create(uniqueTitle, startDate, endDate, client, destinations);
        await TripMembership.ensureMember(trip.id, user.id, client);
        await client.query('COMMIT');
        res.status(201).json(await tripPayload(trip, user.id));
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ message: error.message });
    } finally {
        client.release();
    }
});

// The user's trips for Home (trips only, no items), most recently opened first.
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const ids = await TripMembership.getMemberResourceIds(user.id);
        const trips = await Trip.getManyByIds(ids);
        const byId = Object.fromEntries(trips.map((t) => [t.id, t]));
        res.json({ trips: ids.map((id) => byId[id]).filter(Boolean) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Opens a trip with all its items. With ?join=1 (a share link) the user becomes a member, and a new
// member gets the packing lists already on the trip; otherwise only existing members can open it,
// and anyone else gets a 404.
router.get('/:publicId', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        const isMember = await TripMembership.touchMember(trip.id, user.id);
        if (!isMember && req.query.join !== '1') throw new NotFoundError('Trip not found.');
        if (!isMember) {
            await TripMembership.ensureMember(trip.id, user.id);
            await TripPacklist.copyForNewMember(trip.id, user.id);
        }
        res.json(await tripPayload(trip, user.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Edits a trip's title, dates or destinations (members only). A title already used by another of
// the user's trips gets " (1)", " (2)", ... added.
router.put('/:publicId', async (req, res) => {
    if ('title' in req.body && !(req.body.title || '').trim()) {
        return res.status(400).json({ message: 'Title is required.' });
    }
    const changes = {};
    if ('title' in req.body) changes.title = req.body.title.trim();
    if ('startDate' in req.body) changes.startDate = req.body.startDate;
    if ('endDate' in req.body) changes.endDate = req.body.endDate;
    // Destinations: trimmed, blanks dropped. When any are set, Trip Tips uses them (routes/aiRoutes.js).
    if ('destinations' in req.body) changes.destinations = (req.body.destinations || []).map((d) => (d || '').trim()).filter(Boolean);
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        if (changes.title) {
            changes.title = await TripMembership.uniqueTitle(user.id, changes.title, trip.id);
        }
        const updated = await Trip.update(req.params.publicId, changes);
        res.json(updated);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Sets one day's name, or clears it when empty (members only).
router.put('/:publicId/day-titles/:date', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const updated = await Trip.setDayTitle(req.params.publicId, req.params.date, (req.body.title || '').trim());
        res.json(updated);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Sets the to-do list's title, or resets it to "To-Do" when empty (members only).
router.put('/:publicId/todo-title', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const updated = await Trip.setTodoTitle(req.params.publicId, (req.body.title || '').trim());
        res.json(updated);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Copies a trip into a new one named "<name> (Copy)", with the user as its only member (members
// only; guests are limited to 1 trip). One transaction, like create.
router.post('/:publicId/duplicate', async (req, res) => {
    const client = await pool.connect();
    try {
        const user = requireUser(res);
        await assertResourceQuota(user.id, 'trip');
        const source = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(source.id, user.id);
        const title = await TripMembership.uniqueTitle(user.id, `${source.title} (Copy)`);
        await client.query('BEGIN');
        const trip = await Trip.duplicate(req.params.publicId, client, title);
        await TripMembership.ensureMember(trip.id, user.id, client);
        await client.query('COMMIT');
        res.status(201).json(await tripPayload(trip, user.id));
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(error.status || 500).json({ message: error.message });
    } finally {
        client.release();
    }
});

// "Deletes" a trip for this user: removes their membership and their packing list links on it (the
// packing lists themselves stay). The trip itself is deleted only when its last member leaves, so it
// never disappears for anyone else still using it.
router.delete('/:publicId', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripPacklist.unlinkAllForUser(trip.id, user.id);
        await TripMembership.removeMember(trip.id, user.id);
        res.status(204).end();
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
