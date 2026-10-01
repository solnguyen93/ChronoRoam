// /invites routes: invite someone to a trip or packing list by username, and accept or decline
// invites (shown on Home).
const express = require('express');
const router = express.Router();
const pool = require('../db');
const Trip = require('../models/Trip');
const Packlist = require('../models/Packlist');
const Invite = require('../models/Invite');
const TripPacklist = require('../models/TripPacklist');
const { TripMembership, PacklistMembership } = require('../models/Membership');
const { requireUser } = require('../middleware/auth');
const { BadRequestError, NotFoundError } = require('../expressError');
const { sendInviteEmail } = require('../mailer');

// Sends an invite: { kind: 'trip' | 'packlist', publicId, username }. Only members can invite. Also
// emails the person (if that fails, the invite still stands).
router.post('/', async (req, res) => {
    try {
        const user = requireUser(res);
        const { kind, publicId } = req.body;
        const username = (req.body.username || '').trim().replace(/^@/, '');
        if (!['trip', 'packlist'].includes(kind) || !username) throw new BadRequestError('Enter a username.');
        const resource = kind === 'trip' ? await Trip.getByPublicId(publicId) : await Packlist.getByPublicId(publicId);
        const Membership = kind === 'trip' ? TripMembership : PacklistMembership;
        await Membership.requireMember(resource.id, user.id);

        const { rows: [target] } = await pool.query(
            `SELECT id, name, email FROM users WHERE LOWER(username) = LOWER($1)`,
            [username],
        );
        if (!target) throw new NotFoundError("Username doesn't exist.");
        if (target.id === user.id) throw new BadRequestError("That's you.");
        if ((await Membership.memberUserIds(resource.id)).includes(target.id)) {
            throw new BadRequestError(`They're already on this ${kind === 'trip' ? 'trip' : 'packlist'}.`);
        }
        const created = await Invite.create({ kind, resourceId: resource.id, fromUserId: user.id, toUserId: target.id });
        if (!created) throw new BadRequestError("You've already invited them. Waiting for them to accept.");

        if (target.email) {
            const { rows: [from] } = await pool.query(`SELECT COALESCE(name, username) AS name FROM users WHERE id = $1`, [user.id]);
            sendInviteEmail(target.email, from.name, resource.title, kind).catch((err) => console.error('sendInviteEmail failed:', err.message));
        }
        res.status(201).json({ invited: true });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// This user's invites (for Home).
router.get('/', async (req, res) => {
    try {
        const user = requireUser(res);
        res.json({ invites: await Invite.getForUser(user.id) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Accepts an invite: joins the trip (getting its lists shared with everyone) or the packing list,
// then deletes the invite. Returns { kind, publicId } so the app can open it.
router.post('/:id/accept', async (req, res) => {
    try {
        const user = requireUser(res);
        const invite = await Invite.getForRecipient(req.params.id, user.id);
        if (!invite) throw new NotFoundError('Invite not found.');
        let result;
        if (invite.tripId) {
            const { rows: [trip] } = await pool.query(`SELECT public_id AS "publicId" FROM trips WHERE id = $1`, [invite.tripId]);
            if (!(await TripMembership.touchMember(invite.tripId, user.id))) {
                await TripMembership.ensureMember(invite.tripId, user.id);
                await TripPacklist.copyForNewMember(invite.tripId, user.id);
            }
            result = { kind: 'trip', publicId: trip.publicId };
        } else {
            const { rows: [packlist] } = await pool.query(`SELECT public_id AS "publicId" FROM packlists WHERE id = $1`, [invite.packlistId]);
            await PacklistMembership.ensureMember(invite.packlistId, user.id);
            result = { kind: 'packlist', publicId: packlist.publicId };
        }
        await Invite.remove(invite.id);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Declines an invite (deletes it; nothing else changes).
router.delete('/:id', async (req, res) => {
    try {
        const user = requireUser(res);
        const invite = await Invite.getForRecipient(req.params.id, user.id);
        if (!invite) throw new NotFoundError('Invite not found.');
        await Invite.remove(invite.id);
        res.status(204).end();
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
