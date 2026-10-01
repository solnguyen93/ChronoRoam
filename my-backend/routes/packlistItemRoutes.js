// /packlists/:publicId/items routes: editing a packing list's items from the packing list page.
// Every route needs the user to be a member of the packing list, and returns its items and bags.
const express = require('express');
const router = express.Router({ mergeParams: true });
const PacklistItem = require('../models/PacklistItem');
const PacklistBag = require('../models/PacklistBag');
const Packlist = require('../models/Packlist');
const { requireUser } = require('../middleware/auth');
const { PacklistMembership } = require('../models/Membership');

// The packing list's items and bags.
async function treeData(packlistId) {
    const [items, bags] = await Promise.all([PacklistItem.getAll(packlistId), PacklistBag.getAllForPacklist(packlistId)]);
    return { items, bags };
}

// All of the packing list's items (just the items).
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        res.json(await PacklistItem.getAll(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Adds an item (in a bag, or at the top when bagId is empty).
router.post('/', async (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Text is required.' });
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistItem.add(packlist.id, req.body.bagId || null, text, {
            isHot: req.body.isHot, isCold: req.body.isCold, isLastMin: req.body.isLastMin,
        });
        res.status(201).json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Saves a new item order.
router.put('/reorder', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistItem.reorder(packlist.id, req.body.orderedIds || []);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Marks every item as not packed.
router.put('/uncheck-all', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistItem.uncheckAll(packlist.id);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Moves an item into another bag (null = the top) and saves that bag's order (orderedIds).
router.put('/:id/move', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistItem.move(req.params.id, packlist.id, req.body.bagId || null, req.body.orderedIds || []);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Edits an item: text, packed, or the old hot/cold/last-minute flags.
router.put('/:id', async (req, res) => {
    const changes = {};
    if ('text' in req.body) changes.text = req.body.text;
    if ('done' in req.body) changes.done = req.body.done;
    if ('isHot' in req.body) changes.isHot = req.body.isHot;
    if ('isCold' in req.body) changes.isCold = req.body.isCold;
    if ('isLastMin' in req.body) changes.isLastMin = req.body.isLastMin;
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistItem.update(req.params.id, packlist.id, changes);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes an item.
router.delete('/:id', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistItem.remove(req.params.id, packlist.id);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
