// GET /live: the connection the app keeps open to hear about other people's changes
// (utils/liveUpdates.js). Query: ?keys=trip:<publicId>,packlist:<publicId>&clientId=...&token=...
// The login token comes in the address because the browser's EventSource can't send headers.
// Only trips and lists this user is a member of are watched; the rest are skipped.
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Trip = require('../models/Trip');
const Packlist = require('../models/Packlist');
const { TripMembership, PacklistMembership } = require('../models/Membership');
const { watch } = require('../utils/liveUpdates');

const MAX_KEYS = 20;
const PING_MS = 25000;

router.get('/', async (req, res) => {
    let userId;
    try {
        userId = jwt.verify(String(req.query.token || ''), process.env.JWT_SECRET).user.id;
    } catch {
        return res.status(401).end();
    }

    const requested = String(req.query.keys || '').split(',').filter(Boolean).slice(0, MAX_KEYS);
    const keys = [];
    for (const key of requested) {
        const [kind, publicId] = key.split(':');
        try {
            if (kind === 'trip') {
                const trip = await Trip.getByPublicId(publicId);
                await TripMembership.requireMember(trip.id, userId);
            } else if (kind === 'packlist') {
                const packlist = await Packlist.getByPublicId(publicId);
                await PacklistMembership.requireMember(packlist.id, userId);
            } else continue;
            keys.push(key);
        } catch {
            // Not found or not a member: don't watch it.
        }
    }

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const stop = watch(keys, res, String(req.query.clientId || ''));
    // A comment line now and then keeps hosting proxies from closing a quiet connection.
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    req.on('close', () => {
        clearInterval(ping);
        stop();
    });
});

module.exports = router;
