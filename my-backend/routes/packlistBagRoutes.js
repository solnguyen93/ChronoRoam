// /packlists/:publicId/bags routes: editing a packing list's bags from the packing list page.
// Every route needs the user to be a member of the packing list, and returns its items and bags.
const express = require('express');
const router = express.Router({ mergeParams: true });
const PacklistBag = require('../models/PacklistBag');
const PacklistItem = require('../models/PacklistItem');
const Packlist = require('../models/Packlist');
const { requireUser } = require('../middleware/auth');
const { PacklistMembership } = require('../models/Membership');

// The packing list's items and bags.
async function treeData(packlistId) {
    const [items, bags] = await Promise.all([PacklistItem.getAll(packlistId), PacklistBag.getAllForPacklist(packlistId)]);
    return { items, bags };
}

// Adds a bag (inside another bag, or at the top when parentBagId is empty).
router.post('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistBag.create(packlist.id, req.body.parentBagId || null, req.body.name, req.body.color);
        res.status(201).json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Renames or recolors a bag.
router.put('/:id', async (req, res) => {
    const changes = {};
    if ('name' in req.body) changes.name = req.body.name;
    if ('color' in req.body) changes.color = req.body.color;
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistBag.update(req.params.id, packlist.id, changes);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Moves a bag into another bag (null = the top) and saves that container's order (orderedIds).
router.put('/:id/move', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistBag.move(req.params.id, packlist.id, req.body.parentBagId || null, req.body.orderedIds || []);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes a bag and everything in it.
router.delete('/:id', async (req, res) => {
    try {
        const user = requireUser(res);
        const packlist = await Packlist.getByPublicId(req.params.publicId);
        await PacklistMembership.requireMember(packlist.id, user.id);
        await PacklistBag.remove(req.params.id, packlist.id);
        res.json(await treeData(packlist.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
