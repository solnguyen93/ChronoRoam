// /trips/:publicId/tasks routes: a trip's day-by-day items. Every route needs the user to be a
// member of the trip.
const express = require('express');
const router = express.Router({ mergeParams: true });
const Task = require('../models/Task');
const Trip = require('../models/Trip');
const { requireUser } = require('../middleware/auth');
const { TripMembership } = require('../models/Membership');

// Fields an update request is allowed to change.
const UPDATABLE_FIELDS = ['dayDate', 'text', 'done', 'fixed', 'flight', 'cat', 'fields', 'tags', 'link', 'linkId'];

// All of the trip's items.
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Task.getAll(trip.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Adds an item to a day (dayDate and text are required).
router.post('/', async (req, res) => {
    const dayDate = req.body.dayDate;
    const text = (req.body.text || '').trim();
    if (!dayDate) return res.status(400).json({ message: 'dayDate is required.' });
    if (!text) return res.status(400).json({ message: 'Text is required.' });
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const task = await Task.add(trip.id, {
            dayDate,
            text,
            done: Boolean(req.body.done),
            fixed: Boolean(req.body.fixed),
            flight: Boolean(req.body.flight),
            cat: req.body.cat ?? null,
            fields: req.body.fields || {},
            tags: req.body.tags || {},
            link: req.body.link ?? null,
            linkId: req.body.linkId ?? null,
        });
        res.status(201).json(task);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Saves a new order for one day's items (see Task.reorder).
router.put('/reorder', async (req, res) => {
    const dayDate = req.body.dayDate;
    if (!dayDate) return res.status(400).json({ message: 'dayDate is required.' });
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Task.reorder(trip.id, dayDate, req.body.orderedIds || []));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Moves an item to another day, moving its paired item if needed (see Task.moveToDay).
router.put('/:id/move-day', async (req, res) => {
    const dayDate = req.body.dayDate;
    if (!dayDate) return res.status(400).json({ message: 'dayDate is required.' });
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Task.moveToDay(req.params.id, trip.id, dayDate));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Edits an item (only the fields in UPDATABLE_FIELDS).
router.put('/:id', async (req, res) => {
    const changes = {};
    for (const field of UPDATABLE_FIELDS) {
        if (field in req.body) changes[field] = req.body[field];
    }
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Task.update(req.params.id, trip.id, changes));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes an item.
router.delete('/:id', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        await Task.remove(req.params.id, trip.id);
        res.json({ message: 'Task removed.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
