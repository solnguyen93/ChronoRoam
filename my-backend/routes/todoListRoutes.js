// /trips/:publicId/todo-lists routes: a trip's named to-do lists (several per trip). Every route
// needs the user to be a member of the trip. Editing/deleting an individual item still goes
// through the existing /trips/:publicId/todos/:id routes (todoRoutes.js) — those operate by todo
// id alone and don't care which list it's in, so there's no need to duplicate them here.
const express = require('express');
const router = express.Router({ mergeParams: true });
const Todo = require('../models/Todo');
const TodoList = require('../models/TodoList');
const Trip = require('../models/Trip');
const { requireUser } = require('../middleware/auth');
const { TripMembership } = require('../models/Membership');

// All of a trip's lists, each with its items nested.
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        const lists = await TodoList.getAll(trip.id);
        const withItems = await Promise.all(lists.map(async (list) => ({ ...list, items: await Todo.getAllForList(list.id) })));
        res.json(withItems);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Adds a new list (title is required).
router.post('/', async (req, res) => {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Title is required.' });
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.status(201).json(await TodoList.create(trip.id, title));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Renames a list.
router.put('/:listId', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await TodoList.rename(req.params.listId, trip.id, req.body.title));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes a list — refused if it's the trip's last one (see TodoList.remove).
router.delete('/:listId', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        await TodoList.remove(req.params.listId, trip.id);
        res.json({ message: 'To-do list removed.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Adds a to-do to this list (text is required).
router.post('/:listId/todos', async (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Text is required.' });
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.status(201).json(await Todo.addToList(req.params.listId, trip.id, text, req.body.tags || {}));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Saves a new order within this list.
router.put('/:listId/todos/reorder', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Todo.reorderInList(req.params.listId, req.body.orderedIds || []));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Marks every to-do in this list as not done.
router.put('/:listId/todos/uncheck-all', async (req, res) => {
    try {
        const user = requireUser(res);
        const trip = await Trip.getByPublicId(req.params.publicId);
        await TripMembership.requireMember(trip.id, user.id);
        res.json(await Todo.uncheckAllInList(req.params.listId));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
