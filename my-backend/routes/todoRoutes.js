// /trips/:publicId/todos routes: a trip's to-do list. Every route needs the user to be a member
// of the trip.
const express = require('express');
const router = express.Router({ mergeParams: true });
const Todo = require('../models/Todo');
const Trip = require('../models/Trip');
const { requireUser } = require('../middleware/auth');
const { TripMembership } = require('../models/Membership');

// All of the trip's to-dos.
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Todo.getAll(trip.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Adds a to-do (text is required).
router.post('/', async (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Text is required.' });
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.status(201).json(await Todo.add(trip.id, text, req.body.tags || {}));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Saves a new order.
router.put('/reorder', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Todo.reorder(trip.id, req.body.orderedIds || []));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Marks every to-do as not done.
router.put('/uncheck-all', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Todo.uncheckAll(trip.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Edits a to-do's text, done or tags.
router.put('/:id', async (req, res) => {
    const changes = {};
    if ('text' in req.body) changes.text = req.body.text;
    if ('done' in req.body) changes.done = req.body.done;
    if ('tags' in req.body) changes.tags = req.body.tags;
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Todo.update(req.params.id, trip.id, changes));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes a to-do.
router.delete('/:id', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        await Todo.remove(req.params.id, trip.id);
        res.json({ message: 'Todo removed.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
