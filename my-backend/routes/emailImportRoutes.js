// /email-imports routes: forwarded booking emails waiting for the user to review.
const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const PendingEmailImport = require('../models/PendingEmailImport');

// The user's waiting emails (created by webhookRoutes.js).
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const imports = await PendingEmailImport.listForUser(user.id);
        res.json({ imports });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Removes a waiting email: when the user discards it, or after it's been added to a trip.
router.delete('/:id', async (req, res) => {
    try {
        const user = requireUser(res);
        await PendingEmailImport.remove(req.params.id, user.id);
        res.json({ deleted: true });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
